import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findAudioTrackInMp4Header,
  probeHasAudioTrack,
  readMp4Tracks,
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
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], [])
    ).resolves.toBe("https://cdn/1.mp4");
  });

  it("stops probing as soon as it finds audio", async () => {
    const fetchMock = stubCdn({
      "https://cdn/0.mp4": ["vide", "soun"],
      "https://cdn/1.mp4": ["vide", "soun"],
    });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], [])
    ).resolves.toBe("https://cdn/0.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefers an unprobeable candidate over one known to be silent", async () => {
    stubCdn({ "https://cdn/0.mp4": ["vide"], "https://cdn/1.mp4": "error" });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], [])
    ).resolves.toBe("https://cdn/1.mp4");
  });

  // Never fail the request over sound: a silent video still beats an error.
  it("falls back to the first candidate when every one is silent", async () => {
    stubCdn({ "https://cdn/0.mp4": ["vide"], "https://cdn/1.mp4": ["vide"] });

    await expect(
      selectVideoUrlWithAudio(["https://cdn/0.mp4", "https://cdn/1.mp4"], ["https://cdn/dash.mp4"])
    ).resolves.toBe("https://cdn/0.mp4");
  });

  it("uses the captured DASH stream only when there are no candidates", async () => {
    stubCdn({});
    await expect(selectVideoUrlWithAudio([], ["https://cdn/dash.mp4"])).resolves.toBe(
      "https://cdn/dash.mp4"
    );
  });

  it("returns null when there is nothing at all", async () => {
    stubCdn({});
    await expect(selectVideoUrlWithAudio([], [])).resolves.toBeNull();
  });

  it("caps how many candidates it probes", async () => {
    const urls = Array.from({ length: 9 }, (_, index) => `https://cdn/${index}.mp4`);
    const fetchMock = stubCdn(Object.fromEntries(urls.map((url) => [url, ["vide"] as const])));

    await selectVideoUrlWithAudio(urls, []);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

// The two reels reported from production on 2026-10-15. Both were measured
// live: their page data and DASH layout are identical - four vp9 video-only
// representations plus one HE-AAC audio-only representation, all served as
// content-type video/mp4 - and they differ only in whether the progressive
// rendition Instagram hands the API carries audio.
describe("the reported production reels", () => {
  function stubCdn(tracksByUrl: Record<string, Array<"vide" | "soun"> | "error">) {
    const fetchMock = vi.fn(async (url: string) => {
      const tracks = tracksByUrl[String(url)];
      if (!tracks || tracks === "error") return new Response("nope", { status: 403 });
      return new Response(new Uint8Array(mp4(tracks)), { status: 206 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const PROGRESSIVE = "https://cdn/progressive.mp4";
  const DASH_VIDEO = "https://cdn/dash-vp9.mp4";
  const DASH_AUDIO = "https://cdn/dash-heaac.mp4";

  // DeNCvHYJjqj: the progressive rendition is muxed, so it wins outright and
  // the vp9/audio-only DASH streams are never considered.
  it("returns the muxed progressive rendition when it has audio", async () => {
    const fetchMock = stubCdn({
      [PROGRESSIVE]: ["vide", "soun"],
      [DASH_VIDEO]: ["vide"],
      [DASH_AUDIO]: ["soun"],
    });

    await expect(selectVideoUrlWithAudio([PROGRESSIVE], [DASH_AUDIO, DASH_VIDEO])).resolves.toBe(
      PROGRESSIVE
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // DbRC9fzIluT: production logged "no audio track in any of 1 video
  // candidate(s)". The audio-only DASH stream must never be served as the
  // video - it would play as a black screen - so the silent progressive file
  // is still the right answer until a real mux path exists.
  it("never serves the audio-only DASH stream as the video", async () => {
    stubCdn({
      [PROGRESSIVE]: ["vide"],
      [DASH_AUDIO]: ["soun"],
      [DASH_VIDEO]: ["vide"],
    });

    const chosen = await selectVideoUrlWithAudio([PROGRESSIVE], [DASH_AUDIO, DASH_VIDEO]);
    expect(chosen).not.toBe(DASH_AUDIO);
    expect(chosen).toBe(PROGRESSIVE);
  });

  // Instagram serves the audio-only representation as video/mp4, so a caller
  // that trusted content-type would hand this back with no picture at all.
  it("rejects an audio-only stream even when it is the only candidate", async () => {
    stubCdn({ [DASH_AUDIO]: ["soun"] });
    await expect(selectVideoUrlWithAudio([], [DASH_AUDIO])).resolves.toBeNull();
  });

  it("reports the failure with track counts but without the signed URL", async () => {
    const signed = `${PROGRESSIVE}?efg=secret&oh=signature`;
    stubCdn({ [signed]: ["vide"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await selectVideoUrlWithAudio([signed], []);

    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain("1v/0a");
    expect(message).not.toContain("signature");
    warn.mockRestore();
  });

  // If a later mux path ever supplies a combined file, it must win.
  it("prefers a combined A/V captured stream over a silent progressive one", async () => {
    const COMBINED = "https://cdn/combined.mp4";
    stubCdn({ [PROGRESSIVE]: ["vide"], [COMBINED]: ["vide", "soun"] });

    await expect(selectVideoUrlWithAudio([PROGRESSIVE], [COMBINED])).resolves.toBe(COMBINED);
  });
});

describe("readMp4Tracks", () => {
  it("counts both kinds of track", () => {
    expect(readMp4Tracks(mp4(["vide", "soun"]))).toEqual({ video: 1, audio: 1 });
  });

  it("reports an audio-only file as having no video", () => {
    expect(readMp4Tracks(mp4(["soun"]))).toEqual({ video: 0, audio: 1 });
  });

  it("returns null when the header cannot be read", () => {
    expect(readMp4Tracks(Buffer.alloc(0))).toBeNull();
  });
});

// Signed CDN URLs carry the access signature in their query string. The
// diagnostic log is the one place that handles them as text, so it is tested
// against a URL whose every parameter is something that must not be logged.
describe("diagnostic logging never leaks credentials", () => {
  const SECRETS = {
    oh: "00_AYBsignature",
    oe: "68EFFFFF",
    _nc_sid: "sessionish",
    ccb: "17-1",
    stp: "dst-mp4",
  };

  it("logs only hostname, encode tag and track counts", async () => {
    const query = new URLSearchParams({
      ...SECRETS,
      efg: Buffer.from(JSON.stringify({ vencode_tag: "xpv_progressive.TEST" })).toString("base64"),
    });
    const url = `https://scontent.cdninstagram.com/o1/v/t2/f2/m86/asset.mp4?${query}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(mp4(["vide"])), { status: 206 }))
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await selectVideoUrlWithAudio([url], []);
    const message = warn.mock.calls[0]?.[0] as string;

    expect(message).toContain("scontent.cdninstagram.com");
    expect(message).toContain("xpv_progressive.TEST");
    expect(message).toContain("1v/0a");
    for (const [key, value] of Object.entries(SECRETS)) {
      expect(message, `leaked ${key}`).not.toContain(value);
    }
    expect(message).not.toContain("?");
    expect(message).not.toContain("asset.mp4");
    warn.mockRestore();
  });

  it("stays quiet and safe when the url is unparseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(mp4(["vide"])), { status: 206 }))
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(selectVideoUrlWithAudio(["not-a-url"], [])).resolves.toBe("not-a-url");
    expect(warn.mock.calls[0]?.[0]).toContain("unparseable");
    warn.mockRestore();
  });
});
