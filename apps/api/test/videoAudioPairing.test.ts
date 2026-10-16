import { afterEach, describe, expect, it, vi } from "vitest";
import { selectVideoAndAudio } from "../src/services/scrapers/mediaExtractionHelpers";
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
    await expect(selectVideoAndAudio([MUXED], [], [DASH_AUDIO])).resolves.toEqual({ url: MUXED });
  });

  // What production sees from a datacenter: only silent renditions.
  it("pairs a video-only file with the DASH manifest's audio stream", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"], [DASH_VIDEO]: ["vide"], [DASH_AUDIO]: ["soun"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [DASH_VIDEO], [DASH_AUDIO])).resolves.toEqual({
      url: VIDEO_ONLY,
      audioUrl: DASH_AUDIO,
    });
  });

  it("never takes a stream with a video track as the sound", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mislabelled = "https://scontent.cdninstagram.com/not-audio.mp4";
    stubProbes({ [VIDEO_ONLY]: ["vide"], [mislabelled]: ["vide"], [DASH_AUDIO]: ["soun"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [mislabelled, DASH_AUDIO])).resolves.toEqual({
      url: VIDEO_ONLY,
      audioUrl: DASH_AUDIO,
    });
  });

  it("falls back to a captured stream measured to be audio-only", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const capturedAudio = "https://scontent.cdninstagram.com/captured-audio.mp4";
    stubProbes({ [VIDEO_ONLY]: ["vide"], [capturedAudio]: ["soun"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [capturedAudio], [])).resolves.toEqual({
      url: VIDEO_ONLY,
      audioUrl: capturedAudio,
    });
  });

  it("returns the silent video, with no audioUrl, when no audio exists anywhere", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"] });
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [])).resolves.toEqual({ url: VIDEO_ONLY });
    expect(warn.mock.calls.some(([line]) => String(line).includes("no separate audio stream found"))).toBe(true);
  });

  // Tells "the reel is silent" apart from "Instagram muted it for this server".
  it("adds Instagram's own audio flags to the log when no sound is found", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"] });
    const describe = vi.fn(async () => "instagram says: has_audio=true should_mute_audio=true");
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [], describe)).resolves.toEqual({ url: VIDEO_ONLY });
    expect(describe).toHaveBeenCalledOnce();
    expect(warn.mock.calls.some(([line]) => String(line).includes("should_mute_audio=true"))).toBe(true);
  });

  it("never fails the request because the flags could not be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"] });
    const broken = vi.fn(async () => Promise.reject(new Error("page closed")));
    await expect(selectVideoAndAudio([VIDEO_ONLY], [], [], broken)).resolves.toEqual({ url: VIDEO_ONLY });
  });

  it("does not read the flags when audio was found", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProbes({ [VIDEO_ONLY]: ["vide"], [DASH_AUDIO]: ["soun"] });
    const describe = vi.fn(async () => "unused");
    await selectVideoAndAudio([VIDEO_ONLY], [], [DASH_AUDIO], describe);
    expect(describe).not.toHaveBeenCalled();
  });

  it("returns null when there is no video at all", async () => {
    stubProbes({});
    await expect(selectVideoAndAudio([], [], [DASH_AUDIO])).resolves.toBeNull();
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
