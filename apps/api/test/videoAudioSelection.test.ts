import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findAudioTrackInMp4Header,
  probeHasAudioTrack,
  selectVideoUrlWithAudio,
} from "../src/services/scrapers/mediaExtractionHelpers";

/** Minimal MP4 box: [size][type][payload]. */
function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

/** An `hdlr` box declaring one track of the given kind. */
function handler(kind: "vide" | "soun"): Buffer {
  const payload = Buffer.alloc(12);
  payload.write(kind, 8, "latin1"); // version+flags(4), pre_defined(4), handler(4)
  return box("hdlr", payload);
}

/** A faststart MP4 header: ftyp, then moov with the given tracks. */
function mp4(tracks: Array<"vide" | "soun">, { truncateMoov = false } = {}): Buffer {
  const moov = box("moov", Buffer.concat(tracks.map(handler)));
  const file = Buffer.concat([box("ftyp", Buffer.from("isom")), moov]);
  return truncateMoov ? file.subarray(0, file.length - 8) : file;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findAudioTrackInMp4Header", () => {
  it("finds an audio track alongside video", () => {
    expect(findAudioTrackInMp4Header(mp4(["vide", "soun"]))).toBe(true);
  });

  // The exact shape production was serving: one video track, no sound.
  it("reports a video-only file as having no audio", () => {
    expect(findAudioTrackInMp4Header(mp4(["vide"]))).toBe(false);
  });

  it("walks past a large leading box to reach moov", () => {
    const filler = box("free", Buffer.alloc(5000));
    const file = Buffer.concat([box("ftyp", Buffer.from("isom")), filler, box("moov", handler("soun"))]);
    expect(findAudioTrackInMp4Header(file)).toBe(true);
  });

  // "Unknown" must never be confused with "silent": a truncated or
  // unparseable header still beats a URL known to have no sound.
  it.each([
    ["a truncated moov", mp4(["vide", "soun"], { truncateMoov: true })],
    ["a header with no moov", box("ftyp", Buffer.from("isom"))],
    ["an empty response", Buffer.alloc(0)],
    ["a nonsense size field", Buffer.concat([Buffer.from([0, 0, 0, 2]), Buffer.from("junk")])],
  ])("returns unknown for %s", (_label, header) => {
    expect(findAudioTrackInMp4Header(header)).toBeNull();
  });
});

describe("probeHasAudioTrack", () => {
  it("requests only the start of the file", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array(mp4(["vide", "soun"])), { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeHasAudioTrack("https://cdn.example/a.mp4")).resolves.toBe(true);
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Range).toMatch(/^bytes=0-\d+$/);
  });

  it.each([
    ["a non-OK response", async () => new Response("nope", { status: 403 })],
    ["a transport failure", async () => Promise.reject(new TypeError("fetch failed"))],
  ])("treats %s as unknown rather than silent", async (_label, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(probeHasAudioTrack("https://cdn.example/a.mp4")).resolves.toBeNull();
  });
});

describe("selectVideoUrlWithAudio", () => {
  /** Serves each URL whatever tracks the map says. */
  function stubCdn(tracksByUrl: Record<string, Array<"vide" | "soun"> | "error">) {
    const fetchMock = vi.fn(async (url: string) => {
      const tracks = tracksByUrl[String(url)];
      if (!tracks || tracks === "error") return new Response("nope", { status: 500 });
      return new Response(new Uint8Array(mp4(tracks)), { status: 206 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  // The production bug: entry [0] is silent, a later entry is not.
  it("skips a silent first candidate for a later one with audio", async () => {
    stubCdn({ "https://cdn/0.mp4": ["vide"], "https://cdn/1.mp4": ["vide", "soun"] });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], null)
    ).resolves.toBe("https://cdn/1.mp4");
  });

  it("stops probing as soon as it finds audio", async () => {
    const fetchMock = stubCdn({
      "https://cdn/0.mp4": ["vide", "soun"],
      "https://cdn/1.mp4": ["vide", "soun"],
    });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], null)
    ).resolves.toBe("https://cdn/0.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefers an unprobeable candidate over one known to be silent", async () => {
    stubCdn({ "https://cdn/0.mp4": ["vide"], "https://cdn/1.mp4": "error" });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], null)
    ).resolves.toBe("https://cdn/1.mp4");
  });

  // Never fail the request over sound: a silent video still beats an error.
  it("falls back to the first candidate when every one is silent", async () => {
    stubCdn({ "https://cdn/0.mp4": ["vide"], "https://cdn/1.mp4": ["vide"] });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], "https://cdn/dash.mp4")
    ).resolves.toBe("https://cdn/0.mp4");
  });

  it("uses the captured DASH stream only when there are no candidates", async () => {
    stubCdn({});
    await expect(selectVideoUrlWithAudio([], "https://cdn/dash.mp4")).resolves.toBe(
      "https://cdn/dash.mp4"
    );
  });

  it("returns null when there is nothing at all", async () => {
    stubCdn({});
    await expect(selectVideoUrlWithAudio([], null)).resolves.toBeNull();
  });

  it("caps how many candidates it probes", async () => {
    const urls = Array.from({ length: 9 }, (_, index) => `https://cdn/${index}.mp4`);
    const fetchMock = stubCdn(Object.fromEntries(urls.map((url) => [url, ["vide"] as const])));

    await selectVideoUrlWithAudio(urls, null);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
