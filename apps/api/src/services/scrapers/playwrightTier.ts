import type { Page } from "playwright";
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
 * Carousel slides: confirmed live 2026-08-04 against 9 real multi-slide
 * posts that Instagram preloads carousel <img> elements directly into the
 * DOM (a sliding window of ~2 slides around the current one) - no click
 * needed to see them, and no new network request fires when advancing
 * within that window (Playwright's response-interception approach used
 * here originally never worked - confirmed live it returns exactly 1
 * slide for a real carousel). Real slides are told apart from unrelated
 * "more posts from this account" thumbnails (which share the same
 * `alt="Photo by ..."` pattern) by matching the post's own date. See
 * collectCarouselSlides() and docs/KNOWN_ISSUES.md for the full story,
 * including why clicking "Next" needs `force: true` (Instagram's
 * anonymous-visitor signup dialog overlaps the button).
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

/**
 * Confirmed live 2026-08-05: the DASH-adaptive video Chromium requests
 * during page load (see capturedVideoUrl above) is video-only - vp9, zero
 * audio streams, verified via ffprobe. Instagram separately embeds a
 * "progressive" (single-file, pre-muxed) rendition in one of the page's
 * server-rendered `<script type="application/json" data-sjs>` relay-data
 * blobs, under a `video_versions` array, even for logged-out visitors who
 * never get the interactive `<video>` element mounted (it's meant for
 * `PolarisPostVideoPlayerLoggedOutSurface.react`). Confirmed live against
 * 2 real reels: that URL is h264+aac, the audio Instagram's own
 * `has_audio: true` flag on the same object promises. Instagram's own
 * `video_versions` entries (differing `type` values) all pointed at the
 * identical URL/resolution in both real posts tested - so this returns
 * one URL, not a real list of distinct qualities (see docs/KNOWN_ISSUES.md
 * for why a quality selector isn't being built on top of this).
 *
 * Deep-searches every relay-data script tag rather than assuming a fixed
 * JSON path, since Instagram's internal component nesting isn't a stable
 * contract - only the presence of a `video_versions` array is relied on.
 * Returns null (not a thrown error) if nothing is found, since this is a
 * best-effort upgrade over capturedVideoUrl, not a required step - e.g.
 * image/carousel posts never have this data at all.
 */
async function findProgressiveVideoUrl(page: Page): Promise<string | null> {
  return page.evaluate<string | null>(`
    (() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/json"][data-sjs]')
      );

      function deepFindVideoVersions(node, depth) {
        if (depth > 14 || node === null || typeof node !== "object") return null;
        if (Array.isArray(node.video_versions) && node.video_versions.length > 0) {
          return node.video_versions;
        }
        for (const key of Object.keys(node)) {
          const found = deepFindVideoVersions(node[key], depth + 1);
          if (found) return found;
        }
        return null;
      }

      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent || "");
          const versions = deepFindVideoVersions(parsed, 0);
          if (versions && versions[0] && typeof versions[0].url === "string") {
            return versions[0].url;
          }
        } catch {
          // Not every data-sjs script tag is well-formed JSON we care
          // about - skip and keep searching the rest.
        }
      }
      return null;
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

const COVER_DATE_PATTERN = /\bon\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/;

/**
 * og:description follows "N likes, M comments - username on <DATE>: ...".
 * Used to tell this post's own carousel slides apart from unrelated
 * "more posts from this account" thumbnails elsewhere on the page, which
 * share the same alt-text pattern but a different date.
 */
function extractCoverDate(ogDescription: string | null): string | null {
  if (!ogDescription) return null;
  const match = ogDescription.match(COVER_DATE_PATTERN);
  const rawDate = match?.[1];
  return rawDate ? normalizeDateText(rawDate) : null;
}

/**
 * Confirmed live 2026-08-04: og:description and <img alt> dates can
 * disagree on zero-padding for the same post - "August 9, 2025" (from
 * og:description) vs. "August 09, 2025" (from an <img alt>) - so an exact
 * substring match silently drops real slides. Stripping a single leading
 * zero from any day-of-month number normalizes both to the same text.
 */
function normalizeDateText(rawDate: string): string {
  return rawDate.replace(/\b0(\d)\b/, "$1").replace(/,/g, "").trim().toLowerCase();
}

interface CarouselSlideCandidate {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Reads whatever "Photo by .../Video by ..." <img> elements are currently
 * in the DOM (Instagram preloads a window of carousel slides - confirmed
 * live, see class doc comment) - unfiltered here so date-normalization
 * (see normalizeDateText()) can run on the Node side against each
 * candidate's own alt text, not inside the injected browser script.
 */
function readPostImages(page: Page): Promise<CarouselSlideCandidate[]> {
  return page.evaluate<CarouselSlideCandidate[]>(`
    Array.from(document.querySelectorAll("img"))
      .filter((img) => /^Photo by |^Video by /.test(img.alt || ""))
      .map((img) => ({ url: img.src, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt }))
  `);
}

function matchesCoverDate(alt: string, normalizedCoverDate: string): boolean {
  const match = alt.match(COVER_DATE_PATTERN);
  const rawDate = match?.[1];
  return rawDate ? normalizeDateText(rawDate) === normalizedCoverDate : false;
}

/**
 * Confirmed live 2026-08-04 against 9 real carousel posts: Instagram
 * preloads carousel slide <img> elements straight into the DOM - no click
 * needed to read the first ~2. Every real example found this session had
 * exactly 2 slides, so clicking "Next" further (to test whether a sliding
 * preload window reveals slide 3+) is implemented as a reasonable
 * extrapolation but is NOT itself confirmed - flagged honestly in
 * docs/KNOWN_ISSUES.md rather than claimed as verified.
 *
 * `force: true` on the click: Instagram's anonymous-visitor signup nudge
 * dialog (role="dialog", "Sign up for Instagram to stay in the loop.")
 * overlaps the Next button and blocks a normal click with a 30s
 * actionability timeout - confirmed live via Playwright's own trace.
 */
async function collectCarouselSlides(
  page: Page,
  coverDate: string | null,
  primaryImageUrl: string
): Promise<string[]> {
  if (!coverDate) return [primaryImageUrl];
  const normalizedCoverDate: string = coverDate;

  const bestByAssetId = new Map<string, CarouselSlideCandidate>();
  const assetOrder: string[] = [];

  function mergeCandidates(candidates: CarouselSlideCandidate[]) {
    for (const candidate of candidates) {
      if (!matchesCoverDate(candidate.alt, normalizedCoverDate)) continue;

      const assetId = extractMediaAssetId(candidate.url);
      if (!assetId) continue;

      const existing = bestByAssetId.get(assetId);
      if (!existing) {
        assetOrder.push(assetId);
        bestByAssetId.set(assetId, candidate);
      } else if (candidate.width * candidate.height > existing.width * existing.height) {
        bestByAssetId.set(assetId, candidate);
      }
    }
  }

  mergeCandidates(await readPostImages(page));
  if (assetOrder.length === 0) return [primaryImageUrl];

  while (assetOrder.length < MAX_CAROUSEL_SLIDES) {
    const nextButton = page.locator('button[aria-label="Next" i]').first();
    const isNextVisible = await nextButton.isVisible().catch(() => false);
    if (!isNextVisible) break;

    await nextButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(SLIDE_CLICK_WAIT_MS);

    const beforeCount = assetOrder.length;
    mergeCandidates(await readPostImages(page));
    if (assetOrder.length === beforeCount) break;
  }

  return assetOrder.map((assetId) => bestByAssetId.get(assetId)!.url);
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
