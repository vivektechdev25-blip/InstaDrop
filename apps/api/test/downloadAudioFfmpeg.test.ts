import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import type { Response as ExpressResponse } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readMp4Tracks } from "../src/services/scrapers/mediaExtractionHelpers";
import { downloadService } from "../src/services/downloadService";

// The same conversion with the real ffmpeg, on real media made here: what
// the mocked suite (downloadAudio.test.ts) cannot show is that the output
// is a real MP3 of the right length, and that real ffmpeg's own words for
// "no audio stream" are the ones the service listens for.
const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const ffprobeAvailable = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

const SOURCE = "https://scontent.cdninstagram.com/o1/v/t2/source.mp4";

interface FakeResponse extends Writable {
  headers: Record<string, string>;
  body: () => Buffer;
  setHeader: (name: string, value: string) => void;
}

function createFakeResponse(): FakeResponse {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  }) as FakeResponse;
  sink.headers = {};
  sink.setHeader = (name, value) => {
    sink.headers[name.toLowerCase()] = value;
  };
  sink.body = () => Buffer.concat(chunks);
  return sink;
}

const asExpress = (res: FakeResponse) => res as unknown as ExpressResponse;

function serve(bytes: Buffer, type: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input) !== SOURCE) throw new Error(`unexpected request to ${String(input)}`);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { "content-type": type, "content-length": String(bytes.length) },
      });
    })
  );
}

let workDir: string;
const fixtures: Record<"tone" | "reel" | "silent" | "silentLate", Buffer> = {} as never;

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-loglevel", "error", ...args]);
}

beforeAll(() => {
  if (!ffmpegAvailable) return;
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mp3-fixture-"));
  const out = (name: string) => path.join(workDir, name);

  // The audio-only AAC stream Instagram serves beside a video-only file.
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", "-c:a", "aac", "-vn", "-y", out("tone.mp4")]);
  // A reel with both tracks.
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10",
    "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=44100",
    "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-y", out("reel.mp4"),
  ]);
  // A reel with no sound at all.
  ffmpeg(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=10", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", "-y", out("silent.mp4")]);
  // The same, but too large for the track list to be read from its start:
  // lossless noise, and `moov` written at the end. Only ffmpeg can tell.
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=gray:size=640x360:rate=30,noise=alls=100:allf=t",
    "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p", "-an", "-y", out("silentLate.mp4"),
  ]);

  fixtures.tone = fs.readFileSync(out("tone.mp4"));
  fixtures.reel = fs.readFileSync(out("reel.mp4"));
  fixtures.silent = fs.readFileSync(out("silent.mp4"));
  fixtures.silentLate = fs.readFileSync(out("silentLate.mp4"));
}, 60_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What ffprobe says about an MP3 written to disk. */
function probeMp3(bytes: Buffer): { codec: string; duration: number } {
  const file = path.join(workDir, `probe-${Date.now()}.mp3`);
  fs.writeFileSync(file, bytes);
  const report = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name:format=duration", "-of", "json", file]).toString()
  ) as { streams: Array<{ codec_name: string }>; format: { duration: string } };
  return { codec: report.streams[0]!.codec_name, duration: Number(report.format.duration) };
}

describe.skipIf(!ffmpegAvailable)("MP3 download with the real ffmpeg", () => {
  it.each([
    ["the separate audio-only stream", "tone", "audio/mp4"],
    ["a reel that carries both tracks", "reel", "video/mp4"],
  ] as const)("turns %s into a real MP3 of the same length", async (_label, fixture, type) => {
    serve(fixtures[fixture], type);
    const res = createFakeResponse();

    await downloadService.mp3ToResponse(SOURCE, "reelsavenow_ABC.mp4", asExpress(res));

    const mp3 = res.body();
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.headers["content-length"]).toBe(String(mp3.length));
    expect(res.headers["content-disposition"]).toBe('attachment; filename="reelsavenow_ABC.mp3"');
    expect(mp3.subarray(0, 3).toString("latin1")).toBe("ID3");
    if (ffprobeAvailable) {
      const { codec, duration } = probeMp3(mp3);
      expect(codec).toBe("mp3");
      expect(duration).toBeGreaterThan(1.8);
      expect(duration).toBeLessThan(2.3);
    }
  });

  it("answers 422 for a reel with no sound, from its track list", async () => {
    expect(readMp4Tracks(fixtures.silent)).toEqual({ video: 1, audio: 0 });
    serve(fixtures.silent, "video/mp4");

    await expect(downloadService.mp3ToResponse(SOURCE, "a.mp3", asExpress(createFakeResponse()))).rejects.toMatchObject({
      statusCode: 422,
      code: "NO_AUDIO",
    });
  });

  it("answers 422 for a reel with no sound whose track list comes last, from ffmpeg's own error", async () => {
    // The premise: the first 2MB hold no track list to read.
    expect(fixtures.silentLate.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(readMp4Tracks(fixtures.silentLate.subarray(0, 2 * 1024 * 1024))).toBeNull();
    serve(fixtures.silentLate, "video/mp4");

    await expect(downloadService.mp3ToResponse(SOURCE, "a.mp3", asExpress(createFakeResponse()))).rejects.toMatchObject({
      statusCode: 422,
      code: "NO_AUDIO",
    });
  });

  it("answers 502 for a file ffmpeg cannot read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    serve(Buffer.alloc(64 * 1024, 0x2a), "audio/mp4");

    await expect(downloadService.mp3ToResponse(SOURCE, "a.mp3", asExpress(createFakeResponse()))).rejects.toMatchObject({
      statusCode: 502,
      message: "We couldn't convert the audio. Please try again.",
    });
  });
});
