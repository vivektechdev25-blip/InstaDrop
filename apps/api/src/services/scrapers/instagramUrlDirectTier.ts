import { instagramGetUrl } from "instagram-url-direct";
import type { InstagramPost, MediaItem } from "@instadrop/types";
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
