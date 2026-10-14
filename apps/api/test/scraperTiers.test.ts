import type { InstagramPost } from "@reelsavenow/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCircuitBreaker } from "../src/services/scrapers/circuitBreaker";

vi.mock("instagram-url-direct", () => ({ instagramGetUrl: vi.fn() }));
vi.mock("../src/services/scrapers/playwrightTier", () => ({
  playwrightTier: { tierName: "playwright", extract: vi.fn() },
}));

const REEL_URL = "https://www.instagram.com/reel/DSdYE_pEm8i/";

const tier2Post: InstagramPost = {
  id: "DSdYE_pEm8i",
  shortcode: "DSdYE_pEm8i",
  caption: "",
  author: { username: "tchalamet", full_name: "tchalamet" },
  media: [{ type: "video", url: "https://x.fbcdn.net/v.mp4", thumbnail: "t", dimensions: { width: 1, height: 1 } }],
};

// The exact error shape instagram-url-direct@2.0.7 throws (observed live).
const refusal = (status: number) =>
  new Error(`Failed instagram request: Request failed with status code ${status}`);

async function loadModules() {
  vi.resetModules();
  const { instagramGetUrl } = await import("instagram-url-direct");
  const { playwrightTier } = await import("../src/services/scrapers/playwrightTier");
  const { scraperService } = await import("../src/services/scraperService");
  const { AppError } = await import("../src/errors/AppError");
  return {
    tier1: vi.mocked(instagramGetUrl),
    tier2: vi.mocked(playwrightTier.extract),
    scraperService,
    AppError,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createCircuitBreaker", () => {
  it("opens for the cooldown, logs once, then closes", () => {
    let clock = 0;
    const log = vi.fn();
    const breaker = createCircuitBreaker({ name: "t", cooldownMs: 1000, now: () => clock, log });

    expect(breaker.isOpen()).toBe(false);
    breaker.trip("refused");
    breaker.trip("refused again");
    expect(breaker.isOpen()).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);

    clock = 1000;
    expect(breaker.isOpen()).toBe(false);
    breaker.trip("refused after recovery");
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe("scraper tier cascade", () => {
  it("falls through to Tier 2 on the live 401, without retrying Tier 1", async () => {
    const { tier1, tier2, scraperService } = await loadModules();
    tier1.mockRejectedValue(refusal(401));
    tier2.mockResolvedValue(tier2Post);

    await expect(scraperService.extractMedia(REEL_URL)).resolves.toEqual(tier2Post);
    expect(tier1).toHaveBeenCalledTimes(1);
    expect(tier1).toHaveBeenCalledWith(REEL_URL, { retries: 0, delay: 0 });
  });

  it.each([401, 403, 429])("skips Tier 1 for 15 minutes after a %i, then tries again", async (status) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { tier1, tier2, scraperService } = await loadModules();
    tier1.mockRejectedValue(refusal(status));
    tier2.mockResolvedValue(tier2Post);

    await scraperService.extractMedia(REEL_URL);
    await scraperService.extractMedia(REEL_URL);
    await scraperService.extractMedia(REEL_URL);
    expect(tier1).toHaveBeenCalledTimes(1);
    expect(tier2).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(15 * 60 * 1000);
    await scraperService.extractMedia(REEL_URL);
    expect(tier1).toHaveBeenCalledTimes(2);
  });

  it("logs the refusal once per cooldown, not per request", async () => {
    const { tier1, tier2, scraperService } = await loadModules();
    tier1.mockRejectedValue(refusal(401));
    tier2.mockResolvedValue(tier2Post);

    for (let request = 0; request < 4; request += 1) await scraperService.extractMedia(REEL_URL);
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
  });

  it("does not trip on unrelated Tier 1 failures", async () => {
    const { tier1, tier2, scraperService } = await loadModules();
    tier1.mockRejectedValue(new Error("Failed instagram request: getaddrinfo ENOTFOUND www.instagram.com"));
    tier2.mockResolvedValue(tier2Post);

    await scraperService.extractMedia(REEL_URL);
    await scraperService.extractMedia(REEL_URL);
    expect(tier1).toHaveBeenCalledTimes(2);
  });

  it("treats a tier's AppError as definitive and skips the remaining tiers", async () => {
    const { tier1, tier2, scraperService } = await loadModules();
    tier1.mockResolvedValue({
      results_number: 1,
      url_list: [],
      post_info: { owner_username: "p", owner_fullname: "p", is_verified: false, is_private: true, likes: 0, is_ad: false, caption: "" },
      media_details: [],
    });

    await expect(scraperService.extractMedia(REEL_URL)).rejects.toMatchObject({
      statusCode: 403,
      code: "PRIVATE_ACCOUNT",
    });
    expect(tier2).not.toHaveBeenCalled();
  });

  // Reels must keep going to Tier 2: Tier 1's only video URL is the
  // video-only DASH rendition (no audio).
  it("hands a single-video post to Tier 2 even when Tier 1 succeeds", async () => {
    const { tier1, tier2, scraperService } = await loadModules();
    tier1.mockResolvedValue({
      results_number: 1,
      url_list: ["https://x.fbcdn.net/dash.mp4"],
      post_info: { owner_username: "a", owner_fullname: "A", is_verified: false, is_private: false, likes: 1, is_ad: false, caption: "" },
      media_details: [{ type: "video", url: "https://x.fbcdn.net/dash.mp4", dimensions: { width: 1, height: 1 } }],
    });
    tier2.mockResolvedValue(tier2Post);

    await expect(scraperService.extractMedia(REEL_URL)).resolves.toEqual(tier2Post);
    expect(tier2).toHaveBeenCalledTimes(1);
  });

  it("maps a failure of every tier to a 502 without internals", async () => {
    const { tier1, tier2, scraperService, AppError } = await loadModules();
    tier1.mockRejectedValue(refusal(401));
    tier2.mockRejectedValue(new Error("page.goto: net::ERR_TIMED_OUT at C:\\internal\\path"));

    const failure = await scraperService.extractMedia(REEL_URL).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ statusCode: 502, code: "SERVER_ERROR" });
    expect((failure as Error).message).not.toMatch(/goto|internal/);
  });
});
