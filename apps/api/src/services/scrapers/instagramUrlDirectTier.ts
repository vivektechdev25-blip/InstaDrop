import { instagramGetUrl } from "instagram-url-direct";
import type { InstagramPost, MediaItem } from "@reelsavenow/types";
import type { IMediaScraper } from "../../interfaces/IMediaScraper";
import { AppError } from "../../errors/AppError";
import { extractShortcode } from "./shortcode";
import { createCircuitBreaker } from "./circuitBreaker";

// Confirmed live 2026-10-14 (2 shortcodes, one real reel and one that
// doesn't exist, identical result): Instagram now answers the package's
// anonymous persisted GraphQL query with 401
// {"message":"Please wait a few minutes before you try again.",
//  "require_login":true}, after a successful CSRF fetch. It's not
// content-specific and not fixable without authentication, which this
// project deliberately doesn't add to the public flow. 2.0.7 is the latest
// published version, so there's no upgrade either. Each refused attempt
// still cost ~750ms (two round trips) on every single request before Tier
// 2 could start.
//
// So a definitive refusal opens a breaker instead: Tier 1 is skipped
// outright for the cooldown, then tried once again - which is also how it
// recovers on its own if Instagram lifts the wall. The package rethrows
// axios errors as "Failed instagram request: Request failed with status
// code NNN", so the status has to be read from that message.
const TIER1_REFUSAL_PATTERN = /status code (401|403|429)\b/;
const TIER1_COOLDOWN_MS = 15 * 60 * 1000;

export const tier1CircuitBreaker = createCircuitBreaker({
  name: "instagram-url-direct",
  cooldownMs: TIER1_COOLDOWN_MS,
});

// The package's default is { retries: 5, delay: 1000 }: on a 403/429 it
// retries five times with doubling delays (31s minimum) and honors
// Retry-After, however large. That's longer than the frontend's own 30s
// timeout before Tier 2 has even started. A refusal is an answer, not a
// transient blip - the breaker above handles it instead of a retry loop.
const NO_RETRIES = { retries: 0, delay: 0 };

/**
 * Tier 1: fast path via the instagram-url-direct package, which replays
 * Instagram's internal persisted-query GraphQL call. Fast when it works,
 * but the persisted doc_id it hardcodes can go stale without warning -
 * any failure here should fall through to the Playwright tier rather than
 * fail the whole request.
 */
export const instagramUrlDirectTier: IMediaScraper = {
  tierName: "instagram-url-direct",

  isAvailable: () => !tier1CircuitBreaker.isOpen(),

  async extract(url: string): Promise<InstagramPost> {
    let result: Awaited<ReturnType<typeof instagramGetUrl>>;
    try {
      result = await instagramGetUrl(url, NO_RETRIES);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (TIER1_REFUSAL_PATTERN.test(message)) {
        tier1CircuitBreaker.trip(message);
      }
      // Always a plain Error, never an AppError: scraperService treats an
      // AppError as a definitive answer and would skip the Tier 2 fallback.
      throw error instanceof Error ? error : new Error(message);
    }

    if (result.post_info?.is_private) {
      throw new AppError(
        "PRIVATE_ACCOUNT",
        "This content is from a private Instagram account and cannot be processed.",
        403
      );
    }

    if (!result.media_details?.length) {
      throw new Error("instagram-url-direct returned no media_details.");
    }

    // Confirmed live 2026-08-05: this package's `item.url` for videos is
    // Instagram's GraphQL `video_url` field, which points at the
    // DASH-adaptive representation - video-only, no audio track (verified
    // via ffprobe on the actual downloaded file). The doc_id this package
    // queries is fixed/persisted server-side, so there's no field to
    // request instead that would return the muxed file. Only the
    // Playwright tier can reach that (it reads a different, page-embedded
    // data source - see findProgressiveVideoUrl() in playwrightTier.ts),
    // so a single (non-carousel) video post throws here to force the
    // fallback rather than silently returning a file with no sound.
    // Carousels are left alone: any video-slide handling is an existing,
    // separately-documented gap in both tiers (see docs/KNOWN_ISSUES.md),
    // not something this change is scoped to fix.
    const isSingleVideoPost =
      result.media_details.length === 1 && result.media_details[0]?.type === "video";
    if (isSingleVideoPost) {
      throw new Error(
        "instagram-url-direct only exposes a video-only (no audio) URL for single video posts - falling through to the Playwright tier."
      );
    }

    const media: MediaItem[] = result.media_details.map((item) => ({
      type: item.type === "video" ? "video" : "image",
      url: item.url,
      thumbnail: item.type === "video" ? item.thumbnail ?? item.url : item.url,
      dimensions: {
        width: item.dimensions?.width ?? 0,
        height: item.dimensions?.height ?? 0,
      },
    }));

    const shortcode = extractShortcode(url);

    return {
      id: shortcode,
      shortcode,
      caption: result.post_info.caption ?? "",
      author: {
        username: result.post_info.owner_username,
        full_name: result.post_info.owner_fullname,
      },
      media,
    };
  },
};
