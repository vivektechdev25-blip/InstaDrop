import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegionProxy } from "../src/config/env";
import { createCircuitBreaker } from "../src/services/scrapers/circuitBreaker";
import type { AudioAvailability, VideoSelection } from "../src/services/scrapers/mediaExtractionHelpers";
import {
  resolveMutedAudio,
  shouldRecoverThroughRegion,
  type recoverAudioThroughRegion,
  type RegionRecovery,
} from "../src/services/scrapers/regionRecovery";

const REEL = "https://www.instagram.com/reel/DdrSGp3SqWG/";
const SILENT: VideoSelection = { url: "https://scontent.cdninstagram.com/muted.mp4", silent: true };
const WITH_SOUND: VideoSelection = { url: "https://scontent.cdninstagram.com/muxed.mp4", silent: false };
const PROXY: RegionProxy = { server: "http://203.0.113.7:8899", username: "u", password: "p", label: "http://203.0.113.7:8899" };

// Exactly what production logged for this reel on 2026-10-16.
const MUTED_FOR_LICENSING: AudioAvailability = {
  hasAudio: false,
  shouldMuteAudio: true,
  muteReason: "This music can't be played due to recent licensing changes with the rights holder.",
  licensedMusic: true,
};
const GENUINELY_SILENT: AudioAvailability = { hasAudio: false, shouldMuteAudio: false, muteReason: null, licensedMusic: false };

const recoverWith = (result: RegionRecovery) => vi.fn<typeof recoverAudioThroughRegion>(async () => result);
// A fresh breaker per call, so one test's failure never pauses another's proxy.
const freshBreaker = () => createCircuitBreaker({ name: "test", cooldownMs: 60_000, log: () => {} });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shouldRecoverThroughRegion", () => {
  it("is true only for a silent file that Instagram says it muted", () => {
    expect(shouldRecoverThroughRegion(SILENT, MUTED_FOR_LICENSING)).toBe(true);
  });

  it.each([
    ["a video that has sound", WITH_SOUND, MUTED_FOR_LICENSING],
    ["a post that genuinely has no sound", SILENT, GENUINELY_SILENT],
    ["unknown flags", SILENT, null],
    ["no video (a photo)", null, MUTED_FOR_LICENSING],
  ])("is false for %s", (_label, video, availability) => {
    expect(shouldRecoverThroughRegion(video, availability)).toBe(false);
  });
});

describe("resolveMutedAudio", () => {
  it("replaces the silent video with the one served through the region proxy", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const recovered: VideoSelection = { url: "https://instagram.fdel27-6.fna.fbcdn.net/with-sound.mp4", silent: false };
    const recover = recoverWith({ outcome: "recovered", video: recovered });

    await expect(resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover, breaker: freshBreaker() })).resolves.toEqual({
      video: recovered,
    });
    expect(recover).toHaveBeenCalledWith(REEL, PROXY, { signal: undefined, timeoutMs: expect.any(Number) });
  });

  it("keeps a recovered separate audio stream for the download to join", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const recovered: VideoSelection = { url: "https://cdn.example/v.mp4", audioUrl: "https://cdn.example/a.mp4", silent: false };
    const result = await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
      proxy: PROXY,
      breaker: freshBreaker(),
      recover: recoverWith({ outcome: "recovered", video: recovered }),
    });
    expect(result.video?.audioUrl).toBe("https://cdn.example/a.mp4");
    expect(result.audioMutedReason).toBeUndefined();
  });

  // The cases that must not touch the proxy at all - and so cost nothing.
  it.each([
    ["the video has sound", WITH_SOUND, MUTED_FOR_LICENSING],
    ["the post genuinely has no sound", SILENT, GENUINELY_SILENT],
  ])("leaves things alone when %s", async (_label, video, availability) => {
    const recover = vi.fn();
    await expect(resolveMutedAudio(REEL, video, availability, { proxy: PROXY, recover, breaker: freshBreaker() })).resolves.toEqual({ video });
    expect(recover).not.toHaveBeenCalled();
  });

  it("keeps the silent video with Instagram's reason when no proxy is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recover = vi.fn();
    await expect(resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: null, recover })).resolves.toEqual({
      video: SILENT,
      audioMutedReason: MUTED_FOR_LICENSING.muteReason,
    });
    expect(recover).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(([line]) => String(line).includes("INSTAGRAM_REGION_PROXY_URL is not set"))).toBe(true);
  });

  it("explains the silence when the post is muted through the proxy too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const there: AudioAvailability = { ...MUTED_FOR_LICENSING, muteReason: "Muted in this region as well." };
    await expect(
      resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
        proxy: PROXY,
        breaker: freshBreaker(),
        recover: recoverWith({ outcome: "muted-there-too", availability: there }),
      })
    ).resolves.toEqual({ video: SILENT, audioMutedReason: "Muted in this region as well." });
  });

  it("falls back to the silent video, with the reason, when the proxy fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
        proxy: PROXY,
        breaker: freshBreaker(),
        recover: recoverWith({ outcome: "failed", reason: "net::ERR_PROXY_CONNECTION_FAILED", proxyFault: true }),
      })
    ).resolves.toEqual({ video: SILENT, audioMutedReason: MUTED_FOR_LICENSING.muteReason });
    expect(warn.mock.calls.some(([line]) => String(line).includes("ERR_PROXY_CONNECTION_FAILED"))).toBe(true);
  });

  it("never logs the proxy credentials", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
      proxy: { ...PROXY, username: "secret-user", password: "secret-pass" },
      breaker: freshBreaker(),
      recover: recoverWith({ outcome: "failed", reason: "timeout", proxyFault: true }),
    });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain("secret-user");
    expect(logged).not.toContain("secret-pass");
  });

  it("uses a default reason when Instagram gave none", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resolveMutedAudio(REEL, SILENT, { ...MUTED_FOR_LICENSING, muteReason: null }, { proxy: null });
    expect(result.audioMutedReason).toMatch(/muted/i);
  });
});

// The frontend gives up on /fetch at 30s. A re-read that pushed the request
// past that would turn a silent video into an error.
describe("resolveMutedAudio: the request's time", () => {
  it("gives the re-read only what is left of the request's time", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const recover = recoverWith({ outcome: "muted-there-too", availability: MUTED_FOR_LICENSING });
    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
      proxy: PROXY,
      breaker: freshBreaker(),
      recover,
      startedAt: Date.now() - 10_000,
    });
    const { timeoutMs } = recover.mock.calls[0]![2]!;
    expect(timeoutMs).toBeGreaterThan(14_000);
    expect(timeoutMs).toBeLessThanOrEqual(15_000);
  });

  it("does not re-read for a client that has already left", async () => {
    const recover = vi.fn();
    const result = await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
      proxy: PROXY,
      breaker: freshBreaker(),
      recover,
      signal: AbortSignal.abort(),
    });
    expect(recover).not.toHaveBeenCalled();
    expect(result.audioMutedReason).toBe(MUTED_FOR_LICENSING.muteReason);
  });

  it("does not start a re-read that cannot finish in time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recover = vi.fn();
    const result = await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, {
      proxy: PROXY,
      breaker: freshBreaker(),
      recover,
      startedAt: Date.now() - 23_000,
    });
    expect(recover).not.toHaveBeenCalled();
    expect(result).toEqual({ video: SILENT, audioMutedReason: MUTED_FOR_LICENSING.muteReason });
    expect(warn.mock.calls.some(([line]) => String(line).includes("too long to re-read it in time"))).toBe(true);
  });
});

describe("region proxy breaker", () => {
  it("pauses the proxy after a failure, so the next muted post does not wait for it again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const breaker = freshBreaker();
    const failing = recoverWith({ outcome: "failed", reason: "page.goto: Timeout 12000ms exceeded.", proxyFault: true });

    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover: failing, breaker });
    const second = await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover: failing, breaker });

    expect(failing).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ video: SILENT, audioMutedReason: MUTED_FOR_LICENSING.muteReason });
  });

  // Regression: every failure used to trip it - a busy server (no browser
  // slot), a client that left, a post with no sound there either - so one
  // busy moment silenced every muted post for five minutes.
  it("is not tripped by a failure that is not the proxy's", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const breaker = freshBreaker();
    const busy = recoverWith({
      outcome: "failed",
      reason: "We're handling too many requests right now. Please try again in a moment.",
      proxyFault: false,
    });

    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover: busy, breaker });
    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover: busy, breaker });

    expect(breaker.isOpen()).toBe(false);
    expect(busy).toHaveBeenCalledTimes(2);
  });

  it("is not tripped by a post that is muted there too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const breaker = freshBreaker();
    const mutedThere = recoverWith({ outcome: "muted-there-too", availability: MUTED_FOR_LICENSING });
    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover: mutedThere, breaker });
    expect(breaker.isOpen()).toBe(false);
  });

  it("comes back after the cooldown", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let now = 0;
    const breaker = createCircuitBreaker({ name: "test", cooldownMs: 1000, now: () => now, log: () => {} });
    const recover = recoverWith({ outcome: "failed", reason: "down", proxyFault: true });
    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover, breaker });
    now = 1001;
    await resolveMutedAudio(REEL, SILENT, MUTED_FOR_LICENSING, { proxy: PROXY, recover, breaker });
    expect(recover).toHaveBeenCalledTimes(2);
  });
});
