import type { Response } from "express";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../errors/AppError";
import { isAllowedCdnUrlString } from "../constants/allowedCdnHosts";
import { readMp4Tracks, type Mp4Tracks } from "./scrapers/mediaExtractionHelpers";

// A CDN URL that redirects is normal; a chain this long isn't, and
// following one indefinitely is a cheap way to tie up a worker.
const MAX_REDIRECTS = 5;
// Applies to getting response headers back, NOT to streaming the body - a
// real reel is tens of megabytes and legitimately takes longer than this
// to transfer. Without a cap on the first phase, a CDN host that accepts
// the connection and then never answers holds the request (and the
// client's own pending download) open indefinitely, since Express sets no
// default timeout of its own.
const RESPONSE_HEADER_TIMEOUT_MS = 15000;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Memory is not what limits downloads - measured 2026-10-15, 20 concurrent
// transfers peaked at 91MB and 40 clients that stop reading mid-transfer
// peaked at 97MB, because pipe() propagates backpressure. What is unbounded
// without a cap is sockets and outbound bandwidth, and the rate limit alone
// does not bound concurrency: 60 requests a window can all arrive at once.
// Sized inside the measured-safe range (40 stalled clients: 97MB), so it
// only ever refuses a burst that is no longer ordinary traffic.
const MAX_CONCURRENT_DOWNLOADS = readPositiveInt(process.env.DOWNLOAD_MAX_CONCURRENCY, 32);
// The header timeout above stops at the first byte. Without a second guard,
// an upstream that sends headers and then stalls holds the transfer - and
// its concurrency slot - open forever. Reset by every chunk, so a slow but
// moving transfer is never cut off.
const BODY_IDLE_TIMEOUT_MS = readPositiveInt(process.env.DOWNLOAD_IDLE_TIMEOUT_MS, 30_000);
// Reels are tens of megabytes. Anything this large is not one, and the
// allowlisted hosts serve far more than Instagram media.
const MAX_DOWNLOAD_BYTES = readPositiveInt(process.env.DOWNLOAD_MAX_BYTES, 300 * 1024 * 1024);
// Only media is proxied. The allowlisted CDNs also serve other content
// types, and relaying, say, an HTML page from this origin is not something
// the endpoint exists to do.
const MEDIA_CONTENT_TYPE = /^(video|image|audio)\//i;

// Converting to MP3 decodes and re-encodes the sound, unlike the copy-only
// join below, and keeps a whole file on disk while it runs. On a 512MB
// container with one browser slot, a few at once is the most that leaves
// room for scraping.
const MAX_CONCURRENT_TRANSCODES = readPositiveInt(process.env.AUDIO_TRANSCODE_MAX_CONCURRENCY, 2);

let activeDownloads = 0;
let activeTranscodes = 0;

/** Exposed for tests. */
export function getActiveDownloadCount(): number {
  return activeDownloads;
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
  return sanitized || "reelsavenow-media";
}

async function fetchWithHeaderTimeout(url: string): Promise<globalThis.Response> {
  const controller = new AbortController();
  const headerTimeout = setTimeout(() => controller.abort(), RESPONSE_HEADER_TIMEOUT_MS);

  try {
    // redirect: "manual" so every hop is re-checked against the allowlist
    // below - fetch's default would follow them silently.
    return await fetch(url, { redirect: "manual", signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError(
        "SERVER_ERROR",
        "This download took too long to start. Please try again.",
        504
      );
    }
    throw error;
  } finally {
    // Cleared as soon as headers are in, deliberately before the body is
    // read: leaving it armed would abort long, perfectly healthy video
    // transfers partway through.
    clearTimeout(headerTimeout);
  }
}

/**
 * downloadMediaSchema only ever sees the URL the caller submitted. A
 * validated CDN URL that 302s somewhere else would walk straight past that
 * check with fetch's default redirect handling - which is the SSRF hole
 * the allowlist exists to close - so every hop is validated here too,
 * before the request to it is made.
 */
async function fetchMediaFollowingSafeRedirects(sourceUrl: string): Promise<globalThis.Response> {
  let currentUrl = sourceUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedCdnUrlString(currentUrl)) {
      throw new AppError(
        "INVALID_URL",
        "This media link isn't a supported Instagram CDN URL.",
        400
      );
    }

    const response = await fetchWithHeaderTimeout(currentUrl);
    const location = response.headers.get("location");

    if (!REDIRECT_STATUS_CODES.has(response.status) || !location) {
      return response;
    }

    // Release the redirect response's own connection before following it.
    await response.body?.cancel().catch(() => {});
    // Resolved against the current URL, since Location is allowed to be
    // relative - and a relative hop can't leave the host anyway.
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new AppError(
    "SERVER_ERROR",
    "Could not download this media right now. Please try again.",
    502
  );
}

interface Upstream {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** Null when the upstream sent none, or sent one that counts compressed bytes. */
  contentLength: string | null;
}

/**
 * Opens an allowlisted media URL, following only allowlisted redirects, and
 * refuses anything that is not media or is larger than the download cap.
 */
async function openUpstream(sourceUrl: string): Promise<Upstream> {
  let upstreamResponse: globalThis.Response;

  try {
    upstreamResponse = await fetchMediaFollowingSafeRedirects(sourceUrl);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // DNS failure, connection reset, malformed Location header - the
    // caller doesn't need to tell these apart, and errorHandler.ts's
    // generic 500 would be less accurate than "the upstream failed".
    throw new AppError(
      "SERVER_ERROR",
      "Could not download this media right now. Please try again.",
      502
    );
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    throw new AppError(
      "SERVER_ERROR",
      "Could not download this media right now. Please try again.",
      502
    );
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  const declaredLength = Number(upstreamResponse.headers.get("content-length") ?? "");

  if (!MEDIA_CONTENT_TYPE.test(contentType) || declaredLength > MAX_DOWNLOAD_BYTES) {
    await upstreamResponse.body.cancel().catch(() => {});
    throw new AppError(
      "SERVER_ERROR",
      "This link didn't lead to a downloadable media file.",
      502
    );
  }
  // fetch() transparently decompresses a gzip/br/deflate body, but the
  // upstream Content-Length still counts the *compressed* bytes - forwarding
  // it would promise the client a different byte count than what's streamed
  // (a truncated or never-finishing download). Media CDNs don't normally
  // compress binary files, so this is defensive; omitting the header just
  // falls back to chunked transfer.
  const contentLength = upstreamResponse.headers.get("content-encoding")
    ? null
    : upstreamResponse.headers.get("content-length");

  return { body: upstreamResponse.body, contentType, contentLength };
}

async function streamToResponse(
  sourceUrl: string,
  filename: string,
  res: Response
): Promise<void> {
  const { body, contentType, contentLength } = await openUpstream(sourceUrl);

  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${sanitizeFilename(filename)}"`
  );
  if (contentLength) {
    res.setHeader("Content-Length", contentLength);
  }

  // Web ReadableStream -> Node Readable; the `as never` sidesteps a type
  // mismatch between the DOM lib's ReadableStream (needed for Playwright's
  // page.evaluate typings elsewhere) and Node's own stream/web type for the
  // same runtime object.
  const nodeStream = Readable.fromWeb(body as never);
  const guard = createTransferGuard();

  await new Promise<void>((resolve, reject) => {
    let isSettled = false;

    function settle(error?: Error): void {
      if (isSettled) return;
      isSettled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    nodeStream.pipe(guard).pipe(res);
    nodeStream.on("error", settle);
    guard.on("error", (error) => {
      // Ends the client's transfer as failed rather than leaving it hanging.
      nodeStream.destroy();
      res.destroy(error);
      settle(error);
    });
    res.on("error", settle);
    res.on("finish", () => settle());
    // Fires on a completed response too (harmlessly - settle() and
    // destroy() are both no-ops by then), but the case it exists for is
    // the client going away mid-download: tab closed, save cancelled,
    // mobile connection dropped. Without tearing the upstream stream down,
    // this keeps pulling CDN bytes into a response nobody is reading.
    res.on("close", () => {
      nodeStream.destroy();
      guard.destroy();
      settle();
    });
  });
}

/**
 * Counts bytes and watches for a stalled upstream, failing the transfer if
 * either limit is crossed. A pass-through, so backpressure still reaches
 * the CDN exactly as it did with a direct pipe.
 */
function createTransferGuard(): Transform {
  let transferred = 0;
  let idleTimer: NodeJS.Timeout | undefined;

  const guard = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      transferred += chunk.length;
      armIdleTimer();
      if (transferred > MAX_DOWNLOAD_BYTES) {
        callback(new Error("download exceeded the size limit"));
        return;
      }
      callback(null, chunk);
    },
    flush(callback: TransformCallback) {
      clearTimeout(idleTimer);
      callback();
    },
    destroy(error, callback) {
      clearTimeout(idleTimer);
      callback(error);
    },
  });

  function armIdleTimer(): void {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => guard.destroy(new Error("upstream stalled mid-transfer")),
      BODY_IDLE_TIMEOUT_MS
    );
  }

  armIdleTimer();
  return guard;
}

// Joining a video-only file to its separate audio stream (see
// selectVideoAndAudio in the scrapers). ffmpeg copies both tracks into one
// MP4 without re-encoding - quick, lossless, and light on CPU.
const FFMPEG_PATH = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const MUX_TIMEOUT_MS = readPositiveInt(process.env.DOWNLOAD_MUX_TIMEOUT_MS, 60_000);
let ffmpegMissingLogged = false;

/** Downloads one allowlisted media URL to a file, under the same limits as a direct transfer. */
async function downloadToFile(sourceUrl: string, filePath: string, signal: AbortSignal): Promise<void> {
  const { body } = await openUpstream(sourceUrl);
  await pipeline(Readable.fromWeb(body as never), createTransferGuard(), createWriteStream(filePath), { signal });
}

type MuxResult = { ok: true } | { ok: false; missing: boolean; detail: string };

/** Runs ffmpeg on local files only - it never sees a URL. */
function runFfmpeg(args: string[], signal: AbortSignal): Promise<MuxResult> {
  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const finish = (result: MuxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    // No shell: the arguments are passed as-is, so no path can be read as a command.
    const child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, missing: false, detail: `timed out after ${MUX_TIMEOUT_MS}ms` });
    }, MUX_TIMEOUT_MS);
    const onAbort = () => {
      child.kill("SIGKILL");
      finish({ ok: false, missing: false, detail: "client went away" });
    };
    signal.addEventListener("abort", onAbort);

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish({ ok: false, missing: error.code === "ENOENT", detail: error.message })
    );
    child.on("close", (code) =>
      finish(code === 0 ? { ok: true } : { ok: false, missing: false, detail: `exit ${code}: ${stderr.trim().slice(-300)}` })
    );
  });
}

/** Sends a finished local file, with its exact length. */
async function sendFile(filePath: string, filename: string, res: Response, contentType = "video/mp4"): Promise<void> {
  const { size } = await stat(filePath);
  // The client may have left while the file was being prepared. A closed
  // response emits neither finish nor close again, so waiting on one would
  // hold the transfer slot forever.
  if (res.destroyed) return;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(filename)}"`);
  res.setHeader("Content-Length", String(size));

  await new Promise<void>((resolve, reject) => {
    const file = createReadStream(filePath);
    let isSettled = false;
    const settle = (error?: Error) => {
      if (isSettled) return;
      isSettled = true;
      if (error) reject(error);
      else resolve();
    };
    file.on("error", (error) => {
      res.destroy(error);
      settle(error);
    });
    res.on("finish", () => settle());
    res.on("close", () => {
      file.destroy();
      settle();
    });
    file.pipe(res);
  });
}

/**
 * Joins a video-only file and a separate audio stream into one MP4 and
 * sends it. Both are fetched in full first (to a private temp folder,
 * always removed afterwards), so the result can be written as a normal
 * faststart MP4 - which every phone, messaging app and desktop player
 * handles - and so a failure is reported as an error before anything is
 * sent, never as a "finished" file that is broken.
 *
 * If the audio cannot be fetched or ffmpeg is unavailable or fails, the
 * video alone is sent, exactly as before this existed, and the reason is
 * logged.
 */
async function muxToResponse(
  videoUrl: string,
  audioUrl: string,
  filename: string,
  res: Response
): Promise<void> {
  const abort = new AbortController();
  const onClientGone = () => {
    if (!res.writableFinished) abort.abort();
  };
  res.on("close", onClientGone);

  const dir = await mkdtemp(path.join(tmpdir(), "reelsavenow-"));
  const videoPath = path.join(dir, "video.mp4");
  const audioPath = path.join(dir, "audio.mp4");
  const outputPath = path.join(dir, "joined.mp4");

  try {
    const [video, audio] = await Promise.allSettled([
      downloadToFile(videoUrl, videoPath, abort.signal),
      downloadToFile(audioUrl, audioPath, abort.signal),
    ]);
    if (abort.signal.aborted) return;
    if (video.status === "rejected") {
      if (video.reason instanceof AppError) throw video.reason;
      throw new AppError("SERVER_ERROR", "Could not download this media right now. Please try again.", 502);
    }

    let fileToSend = videoPath;
    if (audio.status === "rejected") {
      console.warn(`[download] could not fetch the separate audio stream; sending the video alone: ${String(audio.reason)}`);
    } else {
      const result = await runFfmpeg(
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-i",
          videoPath,
          "-i",
          audioPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
          "-y",
          outputPath,
        ],
        abort.signal
      );
      if (abort.signal.aborted) return;
      if (result.ok) {
        fileToSend = outputPath;
      } else if (result.missing) {
        if (!ffmpegMissingLogged) {
          ffmpegMissingLogged = true;
          console.warn(`[download] ffmpeg not found (${FFMPEG_PATH}); videos without a muxed audio track are sent silent`);
        }
      } else {
        console.warn(`[download] joining audio failed; sending the video alone: ${result.detail}`);
      }
    }

    await sendFile(fileToSend, filename, res);
  } finally {
    res.off("close", onClientGone);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Instagram's files declare their tracks (`moov`) at the start: progressive
// renditions are faststart, and DASH streams open with their init segment.
const TRACK_LIST_PROBE_BYTES = 2 * 1024 * 1024;
// What ffmpeg says when `-map 0:a:0` finds no audio stream to convert.
const NO_AUDIO_STREAM = /matches no streams|does not contain any stream/i;
// An ID3 tag and a header frame alone are well under this; a tenth of a
// second of 192kbps audio is already ~2.4KB. Below it, there is no sound.
const MIN_MP3_AUDIO_BYTES = 4096;
let mp3FfmpegMissingLogged = false;

const noAudioError = () => new AppError("NO_AUDIO", "This reel has no audio to download.", 422);
const conversionError = () =>
  new AppError("SERVER_ERROR", "We couldn't convert the audio. Please try again.", 502);

/** The track list a downloaded file declares; null when it declares none we can read. */
async function readTrackList(filePath: string): Promise<Mp4Tracks | null> {
  const file = await open(filePath, "r");
  try {
    const head = Buffer.alloc(TRACK_LIST_PROBE_BYTES);
    const { bytesRead } = await file.read(head, 0, TRACK_LIST_PROBE_BYTES, 0);
    return readMp4Tracks(head.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}

/** Whether a finished file is an MP3 carrying sound: a frame after any ID3 tag, and enough of them. */
async function hasMp3Audio(filePath: string): Promise<boolean> {
  const { size } = await stat(filePath);
  const file = await open(filePath, "r");
  try {
    const head = Buffer.alloc(64 * 1024);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    let offset = 0;
    if (bytesRead >= 10 && head.toString("latin1", 0, 3) === "ID3") {
      // ID3v2 size: four 7-bit bytes, plus a 10-byte footer when flagged.
      const tagSize = ((head[6]! & 0x7f) << 21) | ((head[7]! & 0x7f) << 14) | ((head[8]! & 0x7f) << 7) | (head[9]! & 0x7f);
      offset = 10 + tagSize + (head[5]! & 0x10 ? 10 : 0);
    }
    const frameSync = offset + 1 < bytesRead && head[offset] === 0xff && (head[offset + 1]! & 0xe0) === 0xe0;
    return frameSync && size - offset >= MIN_MP3_AUDIO_BYTES;
  } finally {
    await file.close();
  }
}

/** `reelsavenow_ABC.mp4` -> `reelsavenow_ABC.mp3`, whatever extension was asked for. */
function mp3Filename(filename: string): string {
  return `${sanitizeFilename(filename).replace(/\.[A-Za-z0-9]{1,5}$/, "")}.mp3`;
}

/**
 * Saves only the sound of one media file, as an MP3. The file is fetched in
 * full to a private temp folder (always removed afterwards) under the same
 * allowlist and limits as any download, and checked before anything is
 * sent - so a failure is an error response, never a "finished" MP3 that is
 * silent, empty or cut short.
 *
 * Instagram's audio is AAC, so an MP3 is always a re-encode. Where Instagram
 * has muted a reel, there is no audio track to convert, and that is said
 * (422) rather than worked around.
 */
async function mp3ToResponse(sourceUrl: string, filename: string, res: Response): Promise<void> {
  const abort = new AbortController();
  const onClientGone = () => {
    if (!res.writableFinished) abort.abort();
  };
  res.on("close", onClientGone);

  const dir = await mkdtemp(path.join(tmpdir(), "reelsavenow-"));
  const sourcePath = path.join(dir, "source.mp4");
  const outputPath = path.join(dir, "audio.mp3");

  try {
    try {
      await downloadToFile(sourceUrl, sourcePath, abort.signal);
    } catch (error) {
      if (abort.signal.aborted) return;
      if (error instanceof AppError) throw error;
      // Over the size cap, stalled mid-transfer, or the connection dropped.
      throw new AppError("SERVER_ERROR", "Could not download this media right now. Please try again.", 502);
    }

    // What the file declares, not what its URL ends in. A file whose track
    // list can't be read is left to ffmpeg, which fails on a missing stream.
    const tracks = await readTrackList(sourcePath);
    if (tracks !== null && tracks.audio === 0) throw noAudioError();

    const result = await runFfmpeg(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        sourcePath,
        "-map",
        "0:a:0",
        "-vn",
        "-map_metadata",
        "-1",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-f",
        "mp3",
        "-y",
        outputPath,
      ],
      abort.signal
    );
    if (abort.signal.aborted) return;
    if (!result.ok) {
      if (result.missing) {
        if (!mp3FfmpegMissingLogged) {
          mp3FfmpegMissingLogged = true;
          console.warn(`[download] ffmpeg not found (${FFMPEG_PATH}); MP3 downloads cannot be converted`);
        }
        throw conversionError();
      }
      if (NO_AUDIO_STREAM.test(result.detail)) throw noAudioError();
      console.warn(`[download] converting to MP3 failed: ${result.detail}`);
      throw conversionError();
    }

    if (!(await hasMp3Audio(outputPath))) {
      console.warn("[download] converting to MP3 produced no audio; nothing sent");
      throw conversionError();
    }

    await sendFile(outputPath, mp3Filename(filename), res, "audio/mpeg");
  } finally {
    res.off("close", onClientGone);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const busyError = () =>
  new AppError("SERVER_ERROR", "We're handling too many downloads right now. Please try again in a moment.", 503);

/**
 * Holds one of a fixed number of transfer slots for the whole download, and
 * refuses with 503 rather than queueing: a download is user-initiated and
 * cheap to retry, so waiting gains nothing over an honest "busy".
 */
async function streamWithinCapacity(
  sourceUrl: string,
  filename: string,
  res: Response,
  audioUrl?: string
): Promise<void> {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) throw busyError();

  activeDownloads += 1;
  try {
    if (audioUrl) await muxToResponse(sourceUrl, audioUrl, filename, res);
    else await streamToResponse(sourceUrl, filename, res);
  } finally {
    activeDownloads -= 1;
  }
}

/** The same, plus one of the few conversion slots, held from download to send. */
async function mp3WithinCapacity(sourceUrl: string, filename: string, res: Response): Promise<void> {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS || activeTranscodes >= MAX_CONCURRENT_TRANSCODES) {
    throw busyError();
  }

  activeDownloads += 1;
  activeTranscodes += 1;
  try {
    await mp3ToResponse(sourceUrl, filename, res);
  } finally {
    activeDownloads -= 1;
    activeTranscodes -= 1;
  }
}

export const downloadService = { streamToResponse: streamWithinCapacity, mp3ToResponse: mp3WithinCapacity };
