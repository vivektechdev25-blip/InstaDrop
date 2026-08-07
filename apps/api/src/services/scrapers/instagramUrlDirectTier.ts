import { instagramGetUrl } from "instagram-url-direct";
import type { InstagramPost, MediaItem } from "@reelsavehub/types";
import type { IMediaScraper } from "../../interfaces/IMediaScraper";
import { AppError } from "../../errors/AppError";
import { extractShortcode } from "./shortcode";

/**
 * Tier 1: fast path via the instagram-url-direct package, which replays
 * Instagram's internal persisted-query GraphQL call. Fast when it works,
 * but the persisted doc_id it hardcodes can go stale without warning -
 * any failure here should fall through to the Playwright tier rather than
 * fail the whole request.
 */
export const instagramUrlDirectTier: IMediaScraper = {
  tierName: "instagram-url-direct",

  async extract(url: string): Promise<InstagramPost> {
    const result = await instagramGetUrl(url);

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
