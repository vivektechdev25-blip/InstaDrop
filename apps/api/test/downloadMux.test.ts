import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import type { Response as ExpressResponse } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readMp4Tracks } from "../src/services/scrapers/mediaExtractionHelpers";

const VIDEO = "https://scontent.cdninstagram.com/v.mp4";
const AUDIO = "https://instagram.fdel27-6.fna.fbcdn.net/a.mp4";

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

function stubFetch(files: Record<string, Buffer | (() => Response)>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const entry = files[String(input)];
      if (!entry) throw new Error(`unexpected request to ${String(input)}`);
      if (typeof entry === "function") return entry();
      return new Response(new Uint8Array(entry), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": String(entry.length) },
      });
    })
  );
}

/** The service, loaded fresh so FFMPEG_PATH is read again. */
async function loadService(ffmpegPath?: string) {
  vi.resetModules();
  if (ffmpegPath === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = ffmpegPath;
  return (await import("../src/services/downloadService")).downloadService;
}

/** Leftover temp folders from this service, to prove cleanup. */
const leftovers = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("reelsavenow-"));

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
let videoOnly: Buffer;
let audioOnly: Buffer;
let workDir: string;

beforeAll(() => {
  if (!ffmpegAvailable) return;
  // A real 1-second h264 picture with no sound, and a real AAC tone with no
  // picture - the two halves production receives from Instagram.
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mux-fixture-"));
  const v = path.join(workDir, "v.mp4");
  const a = path.join(workDir, "a.mp4");
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", "-y", v]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1", "-c:a", "aac", "-vn", "-y", a]);
  videoOnly = fs.readFileSync(v);
  audioOnly = fs.readFileSync(a);
});

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  delete process.env.FFMPEG_PATH;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("download with a separate audio stream", () => {
  it.skipIf(!ffmpegAvailable)("joins the video and the audio into one MP4 with both tracks", async () => {
    const service = await loadService();
    stubFetch({ [VIDEO]: videoOnly, [AUDIO]: audioOnly });
    expect(readMp4Tracks(videoOnly)).toEqual({ video: 1, audio: 0 });
    const before = leftovers().length;

    const res = createFakeResponse();
    await service.streamToResponse(VIDEO, "reel.mp4", asExpress(res), AUDIO);

    const file = res.body();
    expect(readMp4Tracks(file)).toEqual({ video: 1, audio: 1 });
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-length"]).toBe(String(file.length));
    expect(res.headers["content-disposition"]).toBe('attachment; filename="reel.mp4"');
    expect(leftovers().length).toBe(before);
  });

  // Never worse than before this existed: the video still downloads.
  it("sends the video alone when ffmpeg is not installed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = await loadService(path.join(os.tmpdir(), "no-such-ffmpeg-binary"));
    const video = Buffer.from("video-bytes");
    stubFetch({ [VIDEO]: video, [AUDIO]: Buffer.from("audio-bytes") });

    const res = createFakeResponse();
    await service.streamToResponse(VIDEO, "reel.mp4", asExpress(res), AUDIO);
    expect(res.body().toString()).toBe("video-bytes");
    expect(res.headers["content-length"]).toBe(String(video.length));
  });

  it("sends the video alone when the audio stream cannot be fetched", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = await loadService();
    stubFetch({ [VIDEO]: Buffer.from("video-bytes"), [AUDIO]: () => new Response("gone", { status: 403 }) });

    const res = createFakeResponse();
    await service.streamToResponse(VIDEO, "reel.mp4", asExpress(res), AUDIO);
    expect(res.body().toString()).toBe("video-bytes");
  });

  it("fails with a 502, sending nothing, when the video itself cannot be fetched", async () => {
    const service = await loadService();
    const before = leftovers().length;
    stubFetch({ [VIDEO]: () => new Response("gone", { status: 403 }), [AUDIO]: Buffer.from("audio-bytes") });

    const res = createFakeResponse();
    await expect(service.streamToResponse(VIDEO, "reel.mp4", asExpress(res), AUDIO)).rejects.toMatchObject({ statusCode: 502 });
    expect(res.body().length).toBe(0);
    expect(leftovers().length).toBe(before);
  });
});
