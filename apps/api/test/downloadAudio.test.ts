import { EventEmitter } from "node:events";
import fs from "node:fs";
import { Writable } from "node:stream";
import type { Response as ExpressResponse } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ffmpeg and the temp folders, observed: every spawn and every temp folder
// the service makes is recorded, so the arguments and the cleanup can be
// asserted exactly - not inferred from a folder count that other test files,
// running in parallel, could change.
const hoisted = vi.hoisted(() => ({
  spawn: null as null | ((command: string, args: string[], options: unknown) => unknown),
  tempDirs: [] as string[],
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: (command: string, args: string[], options: unknown) => hoisted.spawn!(command, args, options),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdtemp: async (prefix: string) => {
      const dir = await actual.mkdtemp(prefix);
      hoisted.tempDirs.push(dir);
      return dir;
    },
  };
});

const AUDIO = "https://instagram.fdel27-6.fna.fbcdn.net/o1/v/t2/audio.mp4";
const VIDEO = "https://scontent.cdninstagram.com/o1/v/t2/video.mp4";

/** Stands in for the ffmpeg child process: what runFfmpeg listens to, and kill(). */
class FakeFfmpeg extends EventEmitter {
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn(() => true);

  constructor(readonly args: string[]) {
    super();
  }

  get input(): string {
    return this.args[this.args.indexOf("-i") + 1]!;
  }

  get output(): string {
    return this.args[this.args.length - 1]!;
  }

  /** Exits the way ffmpeg does: stderr first, then close with a code. */
  exit(code: number, stderr = ""): void {
    if (stderr) this.stderr.emit("data", Buffer.from(stderr));
    this.emit("close", code);
  }
}

const spawned: Array<{ command: string; child: FakeFfmpeg; options: unknown }> = [];
let onSpawn: (child: FakeFfmpeg) => void = () => {};

hoisted.spawn = (command, args, options) => {
  const child = new FakeFfmpeg(args);
  spawned.push({ command, child, options });
  // After runFfmpeg has attached its listeners, like a real process.
  setImmediate(() => onSpawn(child));
  return child;
};

/** Minimal MP4 box: [size][type][payload]. */
function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

/** An MP4 whose `moov` declares these tracks, followed by some media data. */
function mp4(tracks: Array<"vide" | "soun">): Buffer {
  const handler = (kind: string) => {
    const payload = Buffer.alloc(12);
    payload.write(kind, 8, "latin1");
    return box("hdlr", payload);
  };
  return Buffer.concat([
    box("ftyp", Buffer.from("isom")),
    box("moov", Buffer.concat(tracks.map(handler))),
    box("mdat", Buffer.alloc(2048, 1)),
  ]);
}

/** A plausible MP3: an empty ID3v2 tag, then MPEG audio frames (sync 0xFFFB). */
function fakeMp3(frameBytes = 8192): Buffer {
  const tag = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  const frames = Buffer.alloc(frameBytes, 0x55);
  frames[0] = 0xff;
  frames[1] = 0xfb;
  return Buffer.concat([tag, frames]);
}

/** ffmpeg that writes `bytes` as its output and exits cleanly. */
const writes = (bytes: Buffer) => (child: FakeFfmpeg) => {
  fs.writeFileSync(child.output, bytes);
  child.exit(0);
};

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

const file = (bytes: Buffer, type = "audio/mp4") => () =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": type, "content-length": String(bytes.length) },
  });

function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const route = routes[String(input)];
      if (!route) throw new Error(`unexpected request to ${String(input)}`);
      return route();
    })
  );
}

/** The service, loaded fresh so its limits are read from `env` again. */
async function loadService(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("../src/services/downloadService");
}

/** Nothing reached the client, and the temp folder is gone. */
function expectNothingSentAndCleanedUp(res: FakeResponse): void {
  expect(res.headers["content-type"]).toBeUndefined();
  expect(res.body().length).toBe(0);
  expect(hoisted.tempDirs).toHaveLength(1);
  expect(fs.existsSync(hoisted.tempDirs[0]!)).toBe(false);
}

beforeEach(() => {
  spawned.length = 0;
  hoisted.tempDirs.length = 0;
  onSpawn = () => {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MP3 download - success", () => {
  it("converts an audio-only stream to MP3, sent with its exact length and an .mp3 name", async () => {
    const { downloadService } = await loadService();
    stubFetch({ [AUDIO]: file(mp4(["soun"])) });
    const mp3 = fakeMp3();
    onSpawn = writes(mp3);
    const res = createFakeResponse();

    await downloadService.mp3ToResponse(AUDIO, "reelsavenow_ABC.mp4", asExpress(res));

    expect(res.body()).toEqual(mp3);
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.headers["content-length"]).toBe(String(mp3.length));
    expect(res.headers["content-disposition"]).toBe('attachment; filename="reelsavenow_ABC.mp3"');
    expect(fs.existsSync(hoisted.tempDirs[0]!)).toBe(false);
  });

  it("runs ffmpeg on local files only, with an argument list and no shell", async () => {
    const { downloadService } = await loadService();
    stubFetch({ [AUDIO]: file(mp4(["soun"])) });
    onSpawn = writes(fakeMp3());

    await downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(createFakeResponse()));

    expect(spawned).toHaveLength(1);
    const { command, child, options } = spawned[0]!;
    expect(command).toBe("ffmpeg");
    expect(options).not.toHaveProperty("shell");
    expect(child.args).toEqual([
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      child.input,
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
      child.output,
    ]);
    // Both paths are inside the request's own temp folder - never the URL.
    expect(child.input.startsWith(hoisted.tempDirs[0]!)).toBe(true);
    expect(child.output.startsWith(hoisted.tempDirs[0]!)).toBe(true);
  });

  it("converts a video file that carries sound", async () => {
    const { downloadService } = await loadService();
    stubFetch({ [VIDEO]: file(mp4(["vide", "soun"]), "video/mp4") });
    onSpawn = writes(fakeMp3());
    const res = createFakeResponse();

    await downloadService.mp3ToResponse(VIDEO, "reelsavenow_ABC.mp4", asExpress(res));

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(spawned).toHaveLength(1);
  });
});

describe("MP3 download - no sound to convert", () => {
  // Instagram muted it, or the creator removed the sound: ffmpeg cannot
  // make up what is not there, and is not even started.
  it("answers 422 NO_AUDIO for a video with no audio track, without running ffmpeg", async () => {
    const { downloadService } = await loadService();
    stubFetch({ [VIDEO]: file(mp4(["vide"]), "video/mp4") });
    const res = createFakeResponse();

    await expect(downloadService.mp3ToResponse(VIDEO, "a.mp3", asExpress(res))).rejects.toMatchObject({
      statusCode: 422,
      code: "NO_AUDIO",
      message: "This reel has no audio to download.",
    });
    expect(spawned).toHaveLength(0);
    expectNothingSentAndCleanedUp(res);
  });

  it("answers 422 when the track list can't be read and ffmpeg finds no audio stream", async () => {
    const { downloadService } = await loadService();
    stubFetch({ [VIDEO]: file(Buffer.from("not an mp4 header, but served as video"), "video/mp4") });
    onSpawn = (child) => child.exit(1, "Stream map '0:a:0' matches no streams.\nTo ignore this, add a trailing '?' to the map.");
    const res = createFakeResponse();

    await expect(downloadService.mp3ToResponse(VIDEO, "a.mp3", asExpress(res))).rejects.toMatchObject({
      statusCode: 422,
      code: "NO_AUDIO",
    });
    expectNothingSentAndCleanedUp(res);
  });
});

describe("MP3 download - conversion failures", () => {
  it.each([
    ["ffmpeg exits with an error", (child: FakeFfmpeg) => child.exit(1, "Invalid data found when processing input")],
    ["the output is empty", writes(Buffer.alloc(0))],
    ["the output is only a header", writes(fakeMp3(100))],
    ["the output is not an MP3", writes(Buffer.alloc(8192, 0x41))],
    [
      "ffmpeg is not installed",
      (child: FakeFfmpeg) => child.emit("error", Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" })),
    ],
  ])("answers 502, sending nothing, when %s", async (_label, behaviour) => {
    const { downloadService } = await loadService();
    stubFetch({ [AUDIO]: file(mp4(["soun"])) });
    onSpawn = behaviour;
    const res = createFakeResponse();

    await expect(downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(res))).rejects.toMatchObject({
      statusCode: 502,
      code: "SERVER_ERROR",
      message: "We couldn't convert the audio. Please try again.",
    });
    expectNothingSentAndCleanedUp(res);
  });

  it("kills ffmpeg and answers 502 when the conversion runs past its timeout", async () => {
    const { downloadService } = await loadService({ DOWNLOAD_MUX_TIMEOUT_MS: "50" });
    stubFetch({ [AUDIO]: file(mp4(["soun"])) });
    const res = createFakeResponse();

    await expect(downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(res))).rejects.toMatchObject({ statusCode: 502 });
    expect(spawned[0]!.child.kill).toHaveBeenCalledWith("SIGKILL");
    expectNothingSentAndCleanedUp(res);
  });
});

describe("MP3 download - upstream failures", () => {
  it.each([
    ["a non-OK response", () => new Response("gone", { status: 404 })],
    ["something that is not media", () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })],
    [
      "a file that declares itself over the cap",
      () => new Response("x", { status: 200, headers: { "content-type": "audio/mp4", "content-length": "5000" } }),
    ],
    // No Content-Length: the cap is enforced on the bytes as they arrive.
    ["a file that turns out to be over the cap", () => new Response(new Uint8Array(5000), { status: 200, headers: { "content-type": "audio/mp4" } })],
  ])("answers 502 for %s, without running ffmpeg", async (_label, route) => {
    const { downloadService } = await loadService({ DOWNLOAD_MAX_BYTES: "1000" });
    stubFetch({ [AUDIO]: route });
    const res = createFakeResponse();

    await expect(downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(res))).rejects.toMatchObject({ statusCode: 502 });
    expect(spawned).toHaveLength(0);
    expectNothingSentAndCleanedUp(res);
  });

  it("answers 504 when the upstream's headers take longer than 15s", async () => {
    const { downloadService } = await loadService();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
    );
    const res = createFakeResponse();

    const pending = downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(res));
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 504 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expectNothingSentAndCleanedUp(res);
  });

  it("answers 502 when the upstream stalls mid-file", async () => {
    const { downloadService } = await loadService({ DOWNLOAD_IDLE_TIMEOUT_MS: "50" });
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(mp4(["soun"]).subarray(0, 20)));
      },
    });
    stubFetch({ [AUDIO]: () => new Response(stalled, { status: 200, headers: { "content-type": "audio/mp4" } }) });
    const res = createFakeResponse();

    await expect(downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(res))).rejects.toMatchObject({ statusCode: 502 });
    expect(spawned).toHaveLength(0);
    expectNothingSentAndCleanedUp(res);
  });
});

describe("MP3 download - the client and the server's capacity", () => {
  it("stops ffmpeg and cleans up when the client leaves mid-conversion", async () => {
    const { downloadService, getActiveDownloadCount } = await loadService();
    stubFetch({ [AUDIO]: file(mp4(["soun"])) });
    const res = createFakeResponse();

    const pending = downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(res));
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    res.destroy();

    await expect(pending).resolves.toBeUndefined();
    expect(spawned[0]!.child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(res.body().length).toBe(0);
    expect(fs.existsSync(hoisted.tempDirs[0]!)).toBe(false);
    expect(getActiveDownloadCount()).toBe(0);
  });

  it("answers 503 past the conversion cap, keeps video downloads working, and frees its slots after", async () => {
    const { downloadService, getActiveDownloadCount } = await loadService({ AUDIO_TRANSCODE_MAX_CONCURRENCY: "2" });
    stubFetch({ [AUDIO]: file(mp4(["soun"])), [VIDEO]: file(Buffer.from("video-bytes"), "video/mp4") });
    const running: FakeFfmpeg[] = [];
    onSpawn = (child) => running.push(child);

    const first = downloadService.mp3ToResponse(AUDIO, "a.mp3", asExpress(createFakeResponse()));
    const second = downloadService.mp3ToResponse(AUDIO, "b.mp3", asExpress(createFakeResponse()));
    await vi.waitFor(() => expect(running).toHaveLength(2));

    await expect(downloadService.mp3ToResponse(AUDIO, "c.mp3", asExpress(createFakeResponse()))).rejects.toMatchObject({
      statusCode: 503,
      message: "We're handling too many downloads right now. Please try again in a moment.",
    });

    // Conversions take their own slots, not every download's.
    const video = createFakeResponse();
    await downloadService.streamToResponse(VIDEO, "v.mp4", asExpress(video));
    expect(video.body().toString()).toBe("video-bytes");

    for (const child of running) writes(fakeMp3())(child);
    await Promise.all([first, second]);
    expect(getActiveDownloadCount()).toBe(0);

    onSpawn = writes(fakeMp3());
    await expect(downloadService.mp3ToResponse(AUDIO, "d.mp3", asExpress(createFakeResponse()))).resolves.toBeUndefined();
  });
});
