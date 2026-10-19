import type { RegionProxy } from "../../config/env";
import { withBrowserContext } from "./browserManager";
import { createCircuitBreaker, type CircuitBreaker } from "./circuitBreaker";
import {
  findDashAudioUrls,
  findProgressiveVideoUrls,
  formatAudioAvailability,
  readAudioAvailability,
  selectVideoAndAudio,
  type AudioAvailability,
  type VideoSelection,
} from "./mediaExtractionHelpers";
import { getRegionProxy } from "./regionProxy";

/**
 * A document-only read through the proxy measured 0.8-4.3s. The cap keeps a
 * slow or broken proxy from eating the request's time (a wrong password,
 * measured, hangs until the timeout). A load that times out after at least
 * the fair share - about twice the slowest healthy read - is the proxy's
 * fault; one cut shorter by the request's own deadline is not.
 */
const REGION_NAVIGATION_TIMEOUT_MS = 12_000;
const FAIR_NAVIGATION_MS = 8_000;

/**
 * The frontend gives up on /fetch after 30s (apps/web/src/lib/apiClient.ts).
 * A re-read only starts while the whole scrape can still finish inside
 * this, counted from the start of the scrape: one that ran over would turn
 * a silent video into a timeout error.
 */
const FETCH_DEADLINE_MS = 25_000;

/** With less time than this left, the re-read is not attempted. */
const MIN_REGION_READ_MS = 4_000;

/**
 * After the proxy fails, skip it for a while instead of making every muted
 * post wait for the same failure. Only a proxy fault trips it: a post muted
 * there too, a busy server or a client that left says nothing about the
 * proxy.
 */
const regionProxyBreaker = createCircuitBreaker({ name: "region-proxy", cooldownMs: 5 * 60_000 });

/** Shown to the user when Instagram gave no reason of its own. */
export const DEFAULT_MUTE_REASON = "Instagram has muted the sound of this post where our server is.";

/*
 * Why this exists - the root cause of "sometimes the download has sound,
 * sometimes not", measured 2026-10-16 to 2026-10-19:
 *
 * Instagram decides per country which renditions a post page lists. For a
 * reel whose licensed music is not licensed in the requester's country, it
 * mutes the reel there: the page data says `should_mute_audio=true`
 * ("This music can't be played due to recent licensing changes with the
 * rights holder."), every `video_versions` rendition is video-only, and the
 * DASH manifest lists no audio stream. On 2026-10-16 production read
 * Instagram from the US (Railway, San Jose); the site's users are in India,
 * where the same reel is not muted. So reels with original sound downloaded
 * fine and reels with licensed music came out silent - which looked random.
 * No choice among the renditions offered could fix it, because none of them
 * had sound. (By 2026-10-19 production was getting Singapore CDN hosts and
 * that reel had sound: which reels are muted depends on where it runs.)
 *
 * What makes a cheap fix possible: only the page data depends on the
 * country, not who may fetch the media. The production server downloaded
 * India-served renditions (1 video + 1 audio track) and audio streams
 * directly, without any proxy. So only the page read goes through the
 * region proxy, and only for a post Instagram has muted here; probing and
 * the download itself stay direct.
 */

export type RegionRecovery =
  | { outcome: "recovered"; video: VideoSelection }
  | { outcome: "muted-there-too"; availability: AudioAvailability }
  /** `proxyFault`: the proxy itself looks broken, so it is worth pausing. */
  | { outcome: "failed"; reason: string; proxyFault: boolean };

/**
 * Whether a scrape should be retried through the region proxy: the chosen
 * file was measured to have no sound, and Instagram says it muted the post
 * for this requester - not that the post has no sound.
 */
export function shouldRecoverThroughRegion(
  video: VideoSelection | null,
  availability: AudioAvailability | null
): boolean {
  return Boolean(video?.silent && availability?.shouldMuteAudio === true);
}

/**
 * Re-reads the post page through the region proxy and picks a video with
 * sound from what Instagram serves there.
 *
 * Only the HTML document goes through the proxy (measured: ~690KB per
 * read): every other request is aborted, because everything needed - the
 * `video_versions` renditions, the DASH manifest and the audio flags - is
 * in the server-rendered page data. Never throws: a failed recovery leaves
 * the silent download that would have happened anyway.
 *
 * All of it - the wait for a browser slot, the page load and the probes -
 * ends within `timeoutMs`.
 */
export async function recoverAudioThroughRegion(
  url: string,
  proxy: RegionProxy,
  { signal, timeoutMs = FETCH_DEADLINE_MS }: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<RegionRecovery> {
  const deadline = Date.now() + timeoutMs;
  const timeLeft = () => Math.max(0, deadline - Date.now());
  // The wait for a browser slot ends when the client leaves or time is up.
  const slotWait = new AbortController();
  const stopWaiting = () => slotWait.abort();
  if (signal?.aborted) stopWaiting();
  signal?.addEventListener("abort", stopWaiting, { once: true });
  const slotTimer = setTimeout(stopWaiting, timeoutMs);

  try {
    return await withBrowserContext(
      async (context): Promise<RegionRecovery> => {
        const page = await context.newPage();
        await page.route("**/*", (route) =>
          route.request().resourceType() === "document" ? route.continue() : route.abort()
        );

        // The page load is the only step that goes through the proxy, so it
        // is the only failure blamed on it - unless the client left, or this
        // request's own deadline cut the load short. Playwright's proxy
        // errors name the failure (ERR_PROXY_CONNECTION_FAILED, a timeout),
        // never the credentials, which are passed separately.
        // At least 1ms: Playwright reads a timeout of 0 as "no timeout at all".
        const navigationMs = Math.max(1, Math.min(REGION_NAVIGATION_TIMEOUT_MS, timeLeft()));
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationMs });
        } catch (error) {
          const cutShort = error instanceof Error && error.name === "TimeoutError" && navigationMs < FAIR_NAVIGATION_MS;
          return { outcome: "failed", reason: firstLine(error), proxyFault: !signal?.aborted && !cutShort };
        }

        const availability = await readAudioAvailability(page);
        if (availability.shouldMuteAudio === true) return { outcome: "muted-there-too", availability };

        // The first read found this video a moment ago, so a page with none
        // is what a login wall or a block on the proxy's address looks like.
        const progressive = await findProgressiveVideoUrls(page);
        if (progressive.length === 0) {
          return { outcome: "failed", reason: "no video in the page data there", proxyFault: true };
        }

        // Probing is direct, not through the proxy.
        const video = await beforeDeadline(
          selectVideoAndAudio(progressive, [], await findDashAudioUrls(page)),
          timeLeft()
        );
        if (!video) return { outcome: "failed", reason: "no usable video there", proxyFault: false };
        if (video.silent) return { outcome: "failed", reason: "no audio track there either", proxyFault: false };
        return { outcome: "recovered", video };
      },
      { signal: slotWait.signal, proxy, priority: true }
    );
  } catch (error) {
    // No browser slot in time, the client gone, probing past the deadline:
    // none of it says the proxy is broken.
    return { outcome: "failed", reason: firstLine(error), proxyFault: false };
  } finally {
    clearTimeout(slotTimer);
    signal?.removeEventListener("abort", stopWaiting);
  }
}

function firstLine(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0]! : String(error);
}

/** Rejects once `ms` have passed; the work itself is left to finish unobserved. */
function beforeDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("the re-read ran out of time")), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

export interface ResolvedVideo {
  video: VideoSelection | null;
  /**
   * Set when the video stays silent because Instagram muted its sound -
   * Instagram's own reason, for the site to show instead of a silent file
   * with no explanation.
   */
  audioMutedReason?: string;
}

/**
 * The single decision point after a scrape. Leaves every case alone except
 * one: the file is silent and Instagram says it muted the post here. Then
 * the post is re-read through the region proxy when one is configured; if
 * that recovers sound, its video replaces the silent one. Otherwise the
 * silent video stays, with Instagram's reason attached.
 */
export async function resolveMutedAudio(
  url: string,
  video: VideoSelection | null,
  availability: AudioAvailability | null,
  {
    signal,
    startedAt = Date.now(),
    proxy = getRegionProxy(),
    recover = recoverAudioThroughRegion,
    breaker = regionProxyBreaker,
  }: {
    signal?: AbortSignal;
    /** When this request's scrape started; the re-read must fit in what is left. */
    startedAt?: number;
    proxy?: RegionProxy | null;
    recover?: typeof recoverAudioThroughRegion;
    breaker?: CircuitBreaker;
  } = {}
): Promise<ResolvedVideo> {
  if (!shouldRecoverThroughRegion(video, availability)) return { video };
  const mutedHere = availability!.muteReason ?? DEFAULT_MUTE_REASON;
  // Nobody is waiting for the answer any more.
  if (signal?.aborted) return { video, audioMutedReason: mutedHere };

  if (!proxy) {
    console.warn(
      "[regionRecovery] Instagram muted this post's sound in this server's country and INSTAGRAM_REGION_PROXY_URL is not set; the video will be silent"
    );
    return { video, audioMutedReason: mutedHere };
  }

  if (breaker.isOpen()) {
    console.warn("[regionRecovery] Instagram muted this post's sound here; the region proxy is paused after a recent failure, so the video will be silent");
    return { video, audioMutedReason: mutedHere };
  }

  const timeLeft = startedAt + FETCH_DEADLINE_MS - Date.now();
  if (timeLeft < MIN_REGION_READ_MS) {
    console.warn(
      `[regionRecovery] Instagram muted this post's sound here; the scrape took ${Math.round((Date.now() - startedAt) / 1000)}s, too long to re-read it in time, so the video will be silent`
    );
    return { video, audioMutedReason: mutedHere };
  }

  console.warn(`[regionRecovery] Instagram muted this post's sound here; re-reading the page through ${proxy.label}`);
  const recovery = await recover(url, proxy, { signal, timeoutMs: timeLeft });

  if (recovery.outcome === "recovered") {
    console.warn(
      `[regionRecovery] recovered the sound: ${recovery.video.audioUrl ? "video plus a separate audio stream, joined on download" : "a rendition with both tracks"}`
    );
    return { video: recovery.video };
  }
  if (recovery.outcome === "muted-there-too") {
    console.warn(`[regionRecovery] muted through the proxy too; the video will be silent: ${formatAudioAvailability(recovery.availability)}`);
    return { video, audioMutedReason: recovery.availability.muteReason ?? mutedHere };
  }
  console.warn(`[regionRecovery] could not re-read the page through the proxy (${recovery.reason}); the video will be silent`);
  if (recovery.proxyFault) breaker.trip(recovery.reason);
  return { video, audioMutedReason: mutedHere };
}
