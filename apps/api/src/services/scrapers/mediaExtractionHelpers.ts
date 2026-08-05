import type { Page } from "playwright";

/**
 * Extracted out of playwrightTier.ts (2026-08-05) so the own-private-
 * content flow (privateContentService.ts, authenticated via session
 * cookie) can reuse the exact same DOM-parsing logic - the audio-fix,
 * full-resolution image recovery, and carousel-slide collection all
 * apply identically to an authenticated page render, not just the
 * anonymous public one. Pure extraction, no behavior change: every
 * function here is byte-for-byte what playwrightTier.ts had inline
 * before, just moved and re-exported.
 */

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const NAVIGATION_TIMEOUT_MS = 20000;
export const POST_LOAD_WAIT_MS = 2500;
export const SLIDE_CLICK_WAIT_MS = 900;
export const MAX_CAROUSEL_SLIDES = 20;

// Confirmed live 2026-08-04 against a real nonexistent shortcode - this is
// the actual current copy ("Post isn't available" / "The link may be
// broken, or the profile may have been removed."), not the classic "Sorry,
// this page isn't available" copy a first guess would produce (see
// docs/KNOWN_ISSUES.md). Shared since both flows can hit a deleted/
// mistyped shortcode.
export const NOT_FOUND_MARKER = "Post isn't available";

export interface PageMeta {
  ogImage: string | null;
  ogDescription: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
}

export async function readPageMeta(page: Page): Promise<PageMeta> {
  // String body, not a closure: tsx/esbuild wraps evaluate() closures with
  // a `__name` helper that only exists in the Node-side module scope, so
  // Playwright's stringified-closure-in-browser call throws `__name is not
  // defined` at runtime. A string body sidesteps that entirely (confirmed
  // live 2026-08-04).
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
 * during page load is video-only - vp9, zero audio streams, verified via
 * ffprobe. Instagram separately embeds a "progressive" (single-file, pre-
 * muxed) rendition in one of the page's server-rendered
 * `<script type="application/json" data-sjs>` relay-data blobs, under a
 * `video_versions` array, even for logged-out visitors who never get the
 * interactive `<video>` element mounted (it's meant for
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
 * best-effort upgrade over a captured network response, not a required
 * step - e.g. image/carousel posts never have this data at all.
 */
export async function findProgressiveVideoUrl(page: Page): Promise<string | null> {
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

export function stripByteRangeParams(videoUrl: string): string {
  const parsed = new URL(videoUrl);
  parsed.searchParams.delete("bytestart");
  parsed.searchParams.delete("byteend");
  return parsed.toString();
}

export interface FullResImageMatch {
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
export async function findFullResolutionImage(
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
export function extractMediaAssetId(cdnUrl: string): string | null {
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
export function extractCoverDate(ogDescription: string | null): string | null {
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
export function normalizeDateText(rawDate: string): string {
  return rawDate.replace(/\b0(\d)\b/, "$1").replace(/,/g, "").trim().toLowerCase();
}

export interface CarouselSlideCandidate {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Reads whatever "Photo by .../Video by ..." <img> elements are currently
 * in the DOM (Instagram preloads a window of carousel slides - confirmed
 * live) - unfiltered here so date-normalization (see normalizeDateText())
 * can run on the Node side against each candidate's own alt text, not
 * inside the injected browser script.
 */
export function readPostImages(page: Page): Promise<CarouselSlideCandidate[]> {
  return page.evaluate<CarouselSlideCandidate[]>(`
    Array.from(document.querySelectorAll("img"))
      .filter((img) => /^Photo by |^Video by /.test(img.alt || ""))
      .map((img) => ({ url: img.src, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt }))
  `);
}

export function matchesCoverDate(alt: string, normalizedCoverDate: string): boolean {
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
 * actionability timeout - confirmed live via Playwright's own trace. For
 * an authenticated session this dialog likely never appears at all (it's
 * specifically the anonymous-visitor nudge), but force:true is harmless
 * either way and keeps this function identical for both callers.
 */
export async function collectCarouselSlides(
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

export function parseOgDescription(ogDescription: string | null): {
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
