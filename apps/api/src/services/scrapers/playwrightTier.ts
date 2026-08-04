import type { Page, Response } from "playwright";
import type { InstagramPost, MediaItem } from "@instadrop/types";
import type { IMediaScraper } from "../../interfaces/IMediaScraper";
import { AppError } from "../../errors/AppError";
import { getBrowser } from "./browserManager";
import { extractShortcode } from "./shortcode";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const NAVIGATION_TIMEOUT_MS = 20000;
const POST_LOAD_WAIT_MS = 2500;
const SLIDE_CLICK_WAIT_MS = 900;
const MAX_CAROUSEL_SLIDES = 20;

// NOT_FOUND_MARKER: confirmed live 2026-08-04 against a real nonexistent
// shortcode - this is the actual current copy ("Post isn't available" /
// "The link may be broken, or the profile may have been removed."), which
// is NOT what a first guess based on general knowledge would produce (the
// classic "Sorry, this page isn't available" copy turned out to be wrong
// for this specific post-permalink route - see docs/KNOWN_ISSUES.md).
const NOT_FOUND_MARKER = "Post isn't available";

// PRIVATE_ACCOUNT_MARKERS: NOT live-verified - no real private post could be
// sourced this session to test against. Given the NOT_FOUND_MARKER lesson
// above, treat this as a best guess, not a confirmed fact. Checking several
// plausible phrasings to reduce single-string guess risk, but this needs
// real QA before it's trusted. See docs/KNOWN_ISSUES.md.
const PRIVATE_ACCOUNT_MARKERS = ["This Account is Private", "This account is private"];

interface PageMeta {
  ogImage: string | null;
  ogDescription: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
}

/**
 * Tier 2 (fallback): renders the real post page in headless Chromium and
 * reads Instagram's own server-rendered og: meta tags for the cover
 * image/caption, plus intercepts the first video/mp4 network response for
 * video posts. Confirmed live against real image and reel posts - plain
 * curl gets stonewalled with a login-walled JS shell, but a real browser
 * context gets the genuine server-rendered tags (see docs/KNOWN_ISSUES.md).
 *
 * For image posts, og:image itself is only Instagram's cropped feed
 * thumbnail - findFullResolutionImage() swaps in the real-resolution
 * rendition by matching CDN media IDs against the page's actual <img>
 * elements. Confirmed live: recovered 1350x1688 from a 640x640 og:image.
 *
 * Carousel slide collection (clicking "Next" and capturing newly-loaded
 * images from the same CDN path family as the cover image) is implemented
 * but NOT live-verified against a real multi-image post - flagged as a
 * known limitation until QA'd against one. Worth noting while investigating
 * the image-resolution fix above: the CDN path family (e.g. "t51.82787-15")
 * used for that matching is NOT specific to this post - it's shared by
 * unrelated posts' images loaded elsewhere on the page (confirmed live),
 * so this carousel mechanism is on shakier ground than it looks. The
 * full-resolution fix above uses a tighter per-asset media ID match
 * instead, specifically to avoid this problem.
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

      const mediaFamily = extractCdnPathFamily(meta.ogImage);
      const slideImageUrls = await collectCarouselSlides(page, mediaFamily, primaryImageUrl);

      // Video capture is only trusted for the single-media case. Carousel
      // slide collection is itself best-effort (see class doc comment), and
      // disambiguating which slide a given video response belongs to isn't
      // reliable enough to build on top of - carousels are treated as
      // image-only until that's verified against a real multi-slide post.
      const videoUrl = slideImageUrls.length === 1 ? capturedVideoUrl : null;

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

async function readPageMeta(page: Page): Promise<PageMeta> {
  // String body - see the note above on why closures break under tsx/esbuild.
  return page.evaluate<PageMeta>(`
    (() => {
      const get = (selector) => document.querySelector(selector)?.getAttribute("content") ?? null;
      return {
        ogImage: get('meta[property="og:image"]'),
        ogDescription: get('meta[property="og:description"]') ?? get('meta[name="description"]'),
        ogImageWidth: get('meta[property="og:image:width"]'),
        ogImageHeight: get('meta[property="og:image:height"]'),
      };
    })()
  `);
}

function stripByteRangeParams(videoUrl: string): string {
  const parsed = new URL(videoUrl);
  parsed.searchParams.delete("bytestart");
  parsed.searchParams.delete("byteend");
  return parsed.toString();
}

interface FullResImageMatch {
  url: string;
  width: number;
  height: number;
}

/**
 * Finds the real, uncropped rendition of the post's cover image by
 * matching the CDN media ID shared between og:image and the actual <img>
 * element Instagram renders for the post (e.g. alt="Photo by X on DATE.").
 * Confirmed live 2026-08-04: for a post whose og:image was a 640x640
 * crop, this found the same asset rendered at 1350x1688 (its real
 * resolution) via a matching media ID in the src. Returns null if no DOM
 * match is found (e.g. video posts, where the post's <img> isn't the
 * cover photo) - callers should fall back to og:image in that case.
 */
async function findFullResolutionImage(
  page: Page,
  ogImageUrl: string
): Promise<FullResImageMatch | null> {
  const mediaId = extractMediaAssetId(ogImageUrl);
  if (!mediaId) return null;

  const candidates = await page.evaluate<FullResImageMatch[]>(`
    Array.from(document.querySelectorAll("img"))
      .filter((img) => img.src.includes(${JSON.stringify(mediaId)}))
      .map((img) => ({ url: img.src, width: img.naturalWidth, height: img.naturalHeight }))
  `);

  if (candidates.length === 0) return null;

  return candidates.reduce((largest, candidate) =>
    candidate.width * candidate.height > largest.width * largest.height ? candidate : largest
  );
}

/**
 * Instagram CDN image filenames look like {assetId}_{containerId}_{hash}_n.jpg
 * - the same two leading numeric segments are shared across every
 * resolution/crop rendition of the same underlying photo.
 */
function extractMediaAssetId(cdnUrl: string): string | null {
  const filename = new URL(cdnUrl).pathname.split("/").pop() ?? "";
  const match = filename.match(/^(\d+_\d+)_/);
  return match?.[1] ?? null;
}

/**
 * Coarse content-vs-avatar filter only: "t51.82787-15"-style paths mark
 * actual post-content images site-wide (as opposed to "t51.2885-19"-style
 * avatar/thumbnail assets), but this is NOT specific to any one post -
 * confirmed live that unrelated posts' images loaded elsewhere on the page
 * share the same family. See the carousel caveat in the class doc comment.
 */
function extractCdnPathFamily(imageUrl: string): string | null {
  const match = imageUrl.match(/\/(t51\.[\w-]+)\//);
  return match?.[1] ?? null;
}

async function collectCarouselSlides(
  page: Page,
  mediaFamily: string | null,
  primaryImageUrl: string
): Promise<string[]> {
  const slides = [primaryImageUrl];
  if (!mediaFamily) return slides;

  for (let slideIndex = 0; slideIndex < MAX_CAROUSEL_SLIDES - 1; slideIndex++) {
    const nextButton = page
      .locator('[aria-label="Next" i][role="button"], button[aria-label="Next" i]')
      .first();
    const isNextVisible = await nextButton.isVisible().catch(() => false);
    if (!isNextVisible) break;

    const alreadyCaptured = new Set(slides);
    let newSlideUrl: string | null = null;

    const onResponse = (response: Response) => {
      if (newSlideUrl) return;
      const responseUrl = response.url();
      const contentType = response.headers()["content-type"] ?? "";
      if (
        contentType.includes("image") &&
        responseUrl.includes(mediaFamily) &&
        !alreadyCaptured.has(responseUrl)
      ) {
        newSlideUrl = responseUrl;
      }
    };

    page.on("response", onResponse);
    await nextButton.click().catch(() => {});
    await page.waitForTimeout(SLIDE_CLICK_WAIT_MS);
    page.off("response", onResponse);

    if (!newSlideUrl) break;
    slides.push(newSlideUrl);
  }

  return slides;
}

const OG_DESCRIPTION_PATTERN = /-\s*([a-zA-Z0-9_.]+)\s+on\s+[^:]+:\s*"?([\s\S]*)$/;

function parseOgDescription(ogDescription: string | null): {
  username: string;
  caption: string;
} {
  if (!ogDescription) return { username: "", caption: "" };

  const match = ogDescription.match(OG_DESCRIPTION_PATTERN);
  if (!match) return { username: "", caption: ogDescription.trim() };

  const username = match[1] ?? "";
  const captionRaw = match[2] ?? "";
  return { username, caption: captionRaw.replace(/"\s*\.?\s*$/, "").trim() };
}
