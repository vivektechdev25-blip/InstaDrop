import type { InstagramPost, MediaItem } from "@reelsavehub/types";
import type { IMediaScraper } from "../../interfaces/IMediaScraper";
import { AppError } from "../../errors/AppError";
import { getBrowser } from "./browserManager";
import { extractShortcode } from "./shortcode";
import {
  USER_AGENT,
  NAVIGATION_TIMEOUT_MS,
  POST_LOAD_WAIT_MS,
  NOT_FOUND_MARKER,
  readPageMeta,
  findProgressiveVideoUrl,
  stripByteRangeParams,
  findFullResolutionImage,
  extractCoverDate,
  collectCarouselSlides,
  parseOgDescription,
} from "./mediaExtractionHelpers";

// PRIVATE_ACCOUNT_MARKERS: NOT live-verified - no real private post could be
// sourced this session to test against. Given the NOT_FOUND_MARKER lesson
// above, treat this as a best guess, not a confirmed fact. Checking several
// plausible phrasings to reduce single-string guess risk, but this needs
// real QA before it's trusted. See docs/KNOWN_ISSUES.md. Public-flow-
// specific (an authenticated session legitimately viewing its own private
// content never renders this marker), so it stays here rather than moving
// to the shared extraction module.
const PRIVATE_ACCOUNT_MARKERS = ["This Account is Private", "This account is private"];

/**
 * Tier 2 (fallback): renders the real post page in headless Chromium and
 * reads Instagram's own server-rendered og: meta tags for the cover
 * image/caption, plus intercepts the first video/mp4 network response for
 * video posts. Confirmed live against real image and reel posts - plain
 * curl gets stonewalled with a login-walled JS shell, but a real browser
 * context gets the genuine server-rendered tags (see docs/KNOWN_ISSUES.md).
 *
 * The DOM-parsing helpers this relies on (full-resolution image recovery,
 * progressive/muxed video URL, carousel slide collection) live in
 * mediaExtractionHelpers.ts (2026-08-05) - extracted out of this file so
 * privateContentService.ts (own-private-content, authenticated via session
 * cookie) can reuse the exact same logic against an authenticated page
 * render, rather than duplicating it.
 */
export const playwrightTier: IMediaScraper = {
  tierName: "playwright",

  async extract(url: string): Promise<InstagramPost> {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    try {
      // Chromium's video-preload behavior fetches the asset in byte-range
      // chunks (bytestart/byteend query params, not a standard HTTP Range
      // header) rather than one full-file request, so whichever video/mp4
      // response we capture is usually a partial chunk. Confirmed live
      // 2026-08-04: stripping those two params from ANY captured chunk's
      // URL and re-requesting it makes the CDN serve the complete file
      // (verified via `curl -L`, full valid .mp4, correct byte size) - so
      // we just take the first video/mp4 response and strip the range.
      //
      // Confirmed live 2026-08-05: this captured URL is Instagram's
      // DASH-adaptive video representation - video-only, vp9, zero audio
      // streams (verified via ffprobe on the actual downloaded file). It's
      // only used as a fallback now; findProgressiveVideoUrl() below finds
      // the real muxed (h264+aac) file and is preferred whenever available.
      let capturedVideoUrl: string | null = null;
      page.on("response", (response) => {
        if (capturedVideoUrl) return;
        const contentType = response.headers()["content-type"] ?? "";
        if (contentType.includes("video")) {
          capturedVideoUrl = stripByteRangeParams(response.url());
        }
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.waitForTimeout(POST_LOAD_WAIT_MS);

      // Passed as a string, not a closure: tsx/esbuild wraps evaluate()
      // closures with a `__name` helper that only exists in the Node-side
      // module scope, so Playwright's stringified-closure-in-browser call
      // throws `__name is not defined` at runtime. A string body sidesteps
      // that entirely (confirmed live 2026-08-04).
      const bodyText = await page.evaluate<string>("document.body.innerText");

      if (bodyText.includes(NOT_FOUND_MARKER)) {
        throw new AppError(
          "INVALID_URL",
          "This post could not be found. It may have been deleted or the link is incorrect.",
          404
        );
      }

      if (PRIVATE_ACCOUNT_MARKERS.some((marker) => bodyText.includes(marker))) {
        throw new AppError(
          "PRIVATE_ACCOUNT",
          "This content is from a private Instagram account and cannot be processed.",
          403
        );
      }

      const meta = await readPageMeta(page);

      if (!meta.ogImage) {
        throw new Error("No og:image found on the rendered page.");
      }

      // og:image is Instagram's cropped, fixed-size (e.g. 640x640) feed
      // thumbnail, not the original - confirmed live: stripping its `stp`
      // crop/resize query param doesn't help either, since it's covered by
      // the URL's signature ("URL signature mismatch" on removal). The
      // actual full-resolution image is rendered on the page as a real
      // <img> element sharing the same CDN media ID - swap to that when we
      // can find it. Falls back to og:image when we can't (e.g. video
      // posts, where the real deliverable is the captured video file and
      // this thumbnail is secondary anyway).
      const fullResImage = await findFullResolutionImage(page, meta.ogImage);
      const primaryImageUrl = fullResImage?.url ?? meta.ogImage;
      const dimensions = fullResImage
        ? { width: fullResImage.width, height: fullResImage.height }
        : { width: Number(meta.ogImageWidth) || 0, height: Number(meta.ogImageHeight) || 0 };

      const coverDate = extractCoverDate(meta.ogDescription);
      const slideImageUrls = await collectCarouselSlides(page, coverDate, primaryImageUrl);

      // Video capture is only trusted for the single-media case. Carousel
      // slide collection is itself best-effort (see class doc comment), and
      // disambiguating which slide a given video response belongs to isn't
      // reliable enough to build on top of - carousels are treated as
      // image-only until that's verified against a real multi-slide post.
      const progressiveVideoUrl =
        slideImageUrls.length === 1 ? await findProgressiveVideoUrl(page) : null;
      const videoUrl =
        slideImageUrls.length === 1 ? progressiveVideoUrl ?? capturedVideoUrl : null;

      const media: MediaItem[] = slideImageUrls.map((imageUrl) =>
        videoUrl
          ? { type: "video", url: videoUrl, thumbnail: imageUrl, dimensions }
          : { type: "image", url: imageUrl, thumbnail: imageUrl, dimensions }
      );

      const { username, caption } = parseOgDescription(meta.ogDescription);
      const shortcode = extractShortcode(url);

      return {
        id: shortcode,
        shortcode,
        caption,
        author: { username, full_name: username },
        media,
      };
    } finally {
      await context.close();
    }
  },
};
