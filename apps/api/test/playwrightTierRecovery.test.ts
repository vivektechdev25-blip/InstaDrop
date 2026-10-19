// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegionProxy } from "../src/config/env";
import { AppError } from "../src/errors/AppError";
import { withBrowserContext } from "../src/services/scrapers/browserManager";
import { playwrightTier } from "../src/services/scrapers/playwrightTier";
import { resetRegionProxyForTests } from "../src/services/scrapers/regionProxy";
import { recoverAudioThroughRegion } from "../src/services/scrapers/regionRecovery";

vi.mock("../src/services/scrapers/browserManager", () => ({ withBrowserContext: vi.fn() }));

const REEL = "https://www.instagram.com/reel/DdrSGp3SqWG/";
const US_MUTED = "https://scontent-sjc6-1.cdninstagram.com/o1/v/t2/f2/m86/muted.mp4";
const INDIA_MUXED = "https://instagram.fdel27-6.fna.fbcdn.net/o1/v/t2/f2/m86/with-sound.mp4";
const LICENSING = "This music can't be played due to recent licensing changes with the rights holder.";

/** Minimal MP4 box: [size][type][payload]. */
function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}
function mp4(tracks: Array<"vide" | "soun">): Buffer {
  const handler = (kind: string) => {
    const payload = Buffer.alloc(12);
    payload.write(kind, 8, "latin1");
    return box("hdlr", payload);
  };
  return Buffer.concat([box("ftyp", Buffer.from("isom")), box("moov", Buffer.concat(tracks.map(handler)))]);
}

interface PageFixture {
  version: string;
  mute: boolean;
  reason?: string;
}

// The page data the way Instagram serves it to a logged-out reel page: one
// media node with its renditions, a DASH manifest and the audio flags,
// inside a data-sjs relay blob.
function render({ version, mute, reason = "" }: PageFixture): void {
  const manifest =
    '<?xml version="1.0"?><MPD><Period><AdaptationSet contentType="video"><Representation bandwidth="1">' +
    `<BaseURL>${version}</BaseURL></Representation></AdaptationSet></Period></MPD>`;
  const node = {
    code: "DdrSGp3SqWG",
    video_versions: [{ url: version }],
    video_dash_manifest: manifest,
    has_audio: !mute,
    should_mute_audio: mute,
    should_mute_audio_reason: reason,
    clips_metadata: { music_info: { music_asset_info: { title: "Dupatta Tera Nau Rang Da" } } },
  };
  document.documentElement.innerHTML = `
    <head>
      <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/111_222_333_n.jpg">
      <meta property="og:description" content="10 likes, 2 comments - the_souwri_life on October 1, 2026: &quot;reel&quot;">
    </head>
    <body><main></main><script type="application/json" data-sjs>${JSON.stringify({
      require: [["Relay", { data: { xig_polaris_media: { if_not_gated_logged_out: node } } }]],
    })}</script></body>`;
}

/** The first context sees the US page; one opened with the proxy sees India's. */
function useFakeBrowser(us: PageFixture, india: PageFixture) {
  vi.mocked(withBrowserContext).mockImplementation(async (run, options) => {
    const fixture = options?.proxy ? india : us;
    const page = {
      on: vi.fn(),
      route: vi.fn(async () => {}),
      goto: vi.fn(async () => {
        render(fixture);
        return null;
      }),
      waitForTimeout: vi.fn(async () => {}),
      url: () => REEL,
      evaluate: async (script: string) => (0, eval)(script),
      locator: () => ({ first: () => ({ isVisible: async () => false, click: async () => {} }) }),
    };
    return run({ newPage: async () => page } as never);
  });
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? "";
    },
  });
});

beforeEach(() => {
  vi.mocked(withBrowserContext).mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Probes: the US rendition is silent, the India one has both tracks.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === US_MUTED) return new Response(new Uint8Array(mp4(["vide"])), { status: 206 });
      if (url === INDIA_MUXED) return new Response(new Uint8Array(mp4(["vide", "soun"])), { status: 206 });
      return new Response("missing", { status: 404 });
    })
  );
});

afterEach(() => {
  delete process.env.INSTAGRAM_REGION_PROXY_URL;
  resetRegionProxyForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("playwright tier: a reel Instagram muted for this server's country", () => {
  it("re-reads it through the region proxy and returns the rendition with sound", async () => {
    process.env.INSTAGRAM_REGION_PROXY_URL = "http://user:pass@203.0.113.7:8899";
    useFakeBrowser({ version: US_MUTED, mute: true, reason: LICENSING }, { version: INDIA_MUXED, mute: false });

    const post = await playwrightTier.extract(REEL);

    expect(post.media).toHaveLength(1);
    expect(post.media[0]).toMatchObject({ type: "video", url: INDIA_MUXED });
    expect(post.media[0]!.audioMutedReason).toBeUndefined();
    const calls = vi.mocked(withBrowserContext).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![1]).toMatchObject({ proxy: { server: "http://203.0.113.7:8899", username: "user", password: "pass" } });
  });

  it("keeps the silent video and says why when no region proxy is configured", async () => {
    useFakeBrowser({ version: US_MUTED, mute: true, reason: LICENSING }, { version: INDIA_MUXED, mute: false });

    const post = await playwrightTier.extract(REEL);

    expect(post.media[0]).toMatchObject({ type: "video", url: US_MUTED, audioMutedReason: LICENSING });
    expect(vi.mocked(withBrowserContext).mock.calls).toHaveLength(1);
  });

  it("says why when the reel is muted through the proxy too", async () => {
    process.env.INSTAGRAM_REGION_PROXY_URL = "http://203.0.113.7:8899";
    useFakeBrowser(
      { version: US_MUTED, mute: true, reason: LICENSING },
      { version: US_MUTED, mute: true, reason: "Muted here as well." }
    );

    const post = await playwrightTier.extract(REEL);

    expect(post.media[0]).toMatchObject({ url: US_MUTED, audioMutedReason: "Muted here as well." });
  });
});

describe("playwright tier: everything else is untouched", () => {
  it("does not open a second page for a reel that already has sound", async () => {
    process.env.INSTAGRAM_REGION_PROXY_URL = "http://203.0.113.7:8899";
    useFakeBrowser({ version: INDIA_MUXED, mute: false }, { version: INDIA_MUXED, mute: false });

    const post = await playwrightTier.extract(REEL);

    expect(post.media[0]).toMatchObject({ url: INDIA_MUXED });
    expect(post.media[0]!.audioMutedReason).toBeUndefined();
    expect(vi.mocked(withBrowserContext).mock.calls).toHaveLength(1);
  });

  it("does not use the proxy for a reel that genuinely has no sound", async () => {
    process.env.INSTAGRAM_REGION_PROXY_URL = "http://203.0.113.7:8899";
    useFakeBrowser({ version: US_MUTED, mute: false }, { version: INDIA_MUXED, mute: false });

    const post = await playwrightTier.extract(REEL);

    expect(post.media[0]).toMatchObject({ url: US_MUTED });
    expect(post.media[0]!.audioMutedReason).toBeUndefined();
    expect(vi.mocked(withBrowserContext).mock.calls).toHaveLength(1);
  });
});

const PROXY: RegionProxy = {
  server: "http://203.0.113.7:8899",
  username: "user",
  password: "pass",
  label: "http://203.0.113.7:8899",
};

/** One page, loaded through the proxy, whose load does whatever `load` does. */
function useFakePage(load: () => Promise<void>) {
  vi.mocked(withBrowserContext).mockImplementation(async (run) =>
    run({
      newPage: async () => ({
        route: vi.fn(async () => {}),
        goto: vi.fn(load),
        evaluate: async (script: string) => (0, eval)(script),
      }),
    } as never)
  );
}

const timeoutError = (message: string) => Object.assign(new Error(message), { name: "TimeoutError" });

// Only a proxy fault pauses the proxy (see resolveMutedAudio), so each way
// the re-read can fail has to be put in the right box.
describe("recoverAudioThroughRegion: what counts against the proxy", () => {
  it("blames the proxy when the page cannot be loaded through it", async () => {
    useFakePage(async () => {
      throw new Error("page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://www.instagram.com/reel/DdrSGp3SqWG/");
    });
    await expect(recoverAudioThroughRegion(REEL, PROXY)).resolves.toEqual({
      outcome: "failed",
      reason: expect.stringContaining("ERR_TUNNEL_CONNECTION_FAILED"),
      proxyFault: true,
    });
  });

  it("blames the proxy for a load that timed out with its full time", async () => {
    useFakePage(async () => {
      throw timeoutError("page.goto: Timeout 12000ms exceeded.");
    });
    await expect(recoverAudioThroughRegion(REEL, PROXY)).resolves.toMatchObject({ outcome: "failed", proxyFault: true });
  });

  it("does not blame the proxy when the request's own deadline cut the load short", async () => {
    useFakePage(async () => {
      throw timeoutError("page.goto: Timeout 3000ms exceeded.");
    });
    await expect(recoverAudioThroughRegion(REEL, PROXY, { timeoutMs: 3_000 })).resolves.toMatchObject({
      outcome: "failed",
      proxyFault: false,
    });
  });

  it("does not blame the proxy when the client has left", async () => {
    const client = new AbortController();
    useFakePage(async () => {
      client.abort();
      throw new Error("page.goto: Target page, context or browser has been closed");
    });
    await expect(recoverAudioThroughRegion(REEL, PROXY, { signal: client.signal })).resolves.toMatchObject({
      outcome: "failed",
      proxyFault: false,
    });
  });

  it("does not blame the proxy when no browser slot is free", async () => {
    vi.mocked(withBrowserContext).mockRejectedValue(
      new AppError("SERVER_ERROR", "We're handling too many requests right now. Please try again in a moment.", 503)
    );
    await expect(recoverAudioThroughRegion(REEL, PROXY)).resolves.toMatchObject({ outcome: "failed", proxyFault: false });
  });

  it("blames the proxy for a page with no video in it - a login wall or a block", async () => {
    useFakePage(async () => {
      document.documentElement.innerHTML = "<head></head><body>Log in to Instagram</body>";
    });
    await expect(recoverAudioThroughRegion(REEL, PROXY)).resolves.toEqual({
      outcome: "failed",
      reason: "no video in the page data there",
      proxyFault: true,
    });
  });

  it("does not blame the proxy for a post with no sound there either", async () => {
    useFakePage(async () => render({ version: US_MUTED, mute: false }));
    await expect(recoverAudioThroughRegion(REEL, PROXY)).resolves.toEqual({
      outcome: "failed",
      reason: "no audio track there either",
      proxyFault: false,
    });
  });

  // The browser slot can come free just as time runs out; a timeout of 0
  // would have let the page load wait forever.
  it("never hands Playwright a timeout of 0, which would mean no timeout at all", async () => {
    const goto = vi.fn(async (_url: string, _options: { timeout: number }) => {
      throw timeoutError("page.goto: Timeout 1ms exceeded.");
    });
    vi.mocked(withBrowserContext).mockImplementation(async (run) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return run({ newPage: async () => ({ route: vi.fn(async () => {}), goto }) } as never);
    });

    await expect(recoverAudioThroughRegion(REEL, PROXY, { timeoutMs: 10 })).resolves.toMatchObject({
      outcome: "failed",
      proxyFault: false,
    });
    expect(goto.mock.calls[0]![1].timeout).toBeGreaterThan(0);
  });

  it("stops probing at the deadline, without blaming the proxy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    useFakePage(async () => render({ version: INDIA_MUXED, mute: false }));
    await expect(recoverAudioThroughRegion(REEL, PROXY, { timeoutMs: 50 })).resolves.toEqual({
      outcome: "failed",
      reason: "the re-read ran out of time",
      proxyFault: false,
    });
  });

  it("asks for a browser slot ahead of newer requests, with the proxy on that context only", async () => {
    useFakePage(async () => render({ version: INDIA_MUXED, mute: false }));
    await expect(recoverAudioThroughRegion(REEL, PROXY)).resolves.toMatchObject({ outcome: "recovered" });
    expect(vi.mocked(withBrowserContext).mock.calls[0]![1]).toMatchObject({ proxy: PROXY, priority: true });
  });
});
