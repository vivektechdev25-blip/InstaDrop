import { afterEach, describe, expect, it, vi } from "vitest";
import { readAudioAvailability, selectVideoAndAudio } from "../src/services/scrapers/mediaExtractionHelpers";
import { downloadMediaSchema } from "../src/validators/downloadMediaSchema";

/** Minimal MP4 box: [size][type][payload]. */
function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

function handler(kind: "vide" | "soun"): Buffer {
  const payload = Buffer.alloc(12);
  payload.write(kind, 8, "latin1");
  return box("hdlr", payload);
}

function mp4(tracks: Array<"vide" | "soun">): Buffer {
  return Buffer.concat([box("ftyp", Buffer.from("isom")), box("moov", Buffer.concat(tracks.map(handler)))]);
}

/** Each URL answers a probe with an MP4 header holding the given tracks. */
function stubProbes(files: Record<string, Array<"vide" | "soun">>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const tracks = files[String(input)];
      if (!tracks) return new Response("missing", { status: 404 });
      return new Response(new Uint8Array(mp4(tracks)), { status: 206 });
    })
  );
}

const VIDEO_ONLY = "https://scontent.cdninstagram.com/progressive.mp4";
const MUXED = "https://scontent.cdninstagram.com/muxed.mp4";
const DASH_AUDIO = "https://instagram.fdel27-6.fna.fbcdn.net/audio.mp4";
const DASH_VIDEO = "https://scontent.cdninstagram.com/dash-video.mp4";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("selectVideoAndAudio", () => {
  it("returns a muxed file on its own when there is one", async () => {
    stubProbes({ [MUXED]: ["vide", "soun"], [DASH_AUDIO]: ["soun"] });
    await expect(selectVideoAndAudio([MUXED], [], [DASH_AUDIO])).resolves.toEqual({ url: MUXED, silent: false });
  });

  // Video-only renditions plus a separate audio stream in the manifest.
  it("pairs a video-only file with the DASH manifest's audio stream", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"], [DASH_VIDEO]: ["vide"], [DASH_AUDIO]: ["soun"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [DASH_VIDEO], [DASH_AUDIO])).resolves.toEqual({
      url: VIDEO_ONLY,
      audioUrl: DASH_AUDIO,
      silent: false,
    });
  });

  it("never takes a stream with a video track as the sound", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mislabelled = "https://scontent.cdninstagram.com/not-audio.mp4";
    stubProbes({ [VIDEO_ONLY]: ["vide"], [mislabelled]: ["vide"], [DASH_AUDIO]: ["soun"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [mislabelled, DASH_AUDIO])).resolves.toEqual({
      url: VIDEO_ONLY,
      audioUrl: DASH_AUDIO,
      silent: false,
    });
  });

  it("falls back to a captured stream measured to be audio-only", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const capturedAudio = "https://scontent.cdninstagram.com/captured-audio.mp4";
    stubProbes({ [VIDEO_ONLY]: ["vide"], [capturedAudio]: ["soun"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [capturedAudio], [])).resolves.toEqual({
      url: VIDEO_ONLY,
      audioUrl: capturedAudio,
      silent: false,
    });
  });

  // What production gets for a reel whose licensed music Instagram muted.
  it("marks the video silent when it was measured to have no audio and none exists anywhere", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [])).resolves.toEqual({ url: VIDEO_ONLY, silent: true });
    expect(warn.mock.calls.some(([line]) => String(line).includes("the video will be silent"))).toBe(true);
  });

  // "Could not tell" must never be reported as "no sound".
  it("does not call an unprobeable rendition silent", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({});
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [])).resolves.toEqual({ url: VIDEO_ONLY, silent: false });
  });

  it("returns null when there is no video at all", async () => {
    stubProbes({});
    await expect(selectVideoAndAudio([], [], [DASH_AUDIO])).resolves.toBeNull();
  });
});

describe("readAudioAvailability", () => {
  // The diagnostics it replaced could never fail a scrape; neither may it.
  it("reports unknown flags, not a failed scrape, when the page cannot be read", async () => {
    const page = {
      evaluate: async () => {
        throw new Error("page.evaluate: Execution context was destroyed");
      },
    };
    await expect(readAudioAvailability(page as never)).resolves.toEqual({
      hasAudio: null,
      shouldMuteAudio: null,
      muteReason: null,
      licensedMusic: false,
    });
  });
});

describe("downloadMediaSchema audio", () => {
  const base = { url: VIDEO_ONLY, filename: "a.mp4" };

  it("is optional", () => {
    expect(downloadMediaSchema.parse(base)).toEqual(base);
  });

  it("accepts an allowlisted CDN stream", () => {
    expect(downloadMediaSchema.parse({ ...base, audio: DASH_AUDIO }).audio).toBe(DASH_AUDIO);
  });

  it.each([
    ["another host", "https://evil.example/audio.mp4"],
    ["plain http", "http://scontent.cdninstagram.com/audio.mp4"],
    ["not a URL", "x"],
  ])("rejects %s", (_label, audio) => {
    expect(() => downloadMediaSchema.parse({ ...base, audio })).toThrow();
  });
});
