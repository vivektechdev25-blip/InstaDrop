import type { BrowserContext, Page } from "playwright";
import type { InstagramPost, MediaItem } from "@instadrop/types";
import { AppError } from "../errors/AppError";
import { getBrowser } from "./scrapers/browserManager";
import { extractShortcode } from "./scrapers/shortcode";
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
} from "./scrapers/mediaExtractionHelpers";

const SESSION_COOKIE_NAME = "sessionid";
// Long-standing, structurally stable Instagram behavior: an
// unauthenticated or expired session requesting a page that needs login
// gets redirected here. Chosen deliberately over guessing an embedded-
// JSON key name for "is this session valid" - a redirect target is a much
// more durable signal than a data-shape guess. Not itself live-verified
// against a real expired cookie (no real test session available in this
// environment - see docs/KNOWN_ISSUES.md).
const LOGIN_REDIRECT_MARKER = "/accounts/login";

interface ViewerIdentity {
  id: string;
  username: string | null;
}

interface ContentOwner {
  id: string | null;
  username: string | null;
}

/**
 * Own-private-content flow (session-cookie authenticated) - separate from
 * scraperService.ts's anonymous public-content tiers entirely, not a third
 * fallback tier. There's no fallback concept here: one authenticated path,
 * and every ambiguous or unexpected outcome fails closed rather than
 * guessing its way to a result.
 *
 * Reuses playwrightTier.ts's DOM-parsing helpers (mediaExtractionHelpers.ts)
 * since the audio-fix / full-resolution-image / carousel-slide logic
 * applies identically to an authenticated page render - only the
 * navigation (cookie-authenticated) and the ownership gate are new.
 *
 * Scope: Reels + Posts only, per the approved architecture (2026-08-05).
 * Stories are not supported - they have no stable, user-copyable permalink
 * the way posts/reels do, and would need a genuinely different "browse
 * your active stories" UI, not this paste-a-link flow. See
 * docs/ARCHITECTURE.md.
 */
async function fetchOwnPrivateContent(sessionCookie: string, url: string): Promise<InstagramPost> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
  });

  try {
    // Cookie lives only on this context, which exists only for this one
    // request - context.close() in the finally block below discards it.
    // Never written to a variable that outlives this function, a log, a
    // database, or a cache at any point.
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: sessionCookie,
        domain: ".instagram.com",
        path: "/",
        httpOnly: true,
        secure: true,
      },
    ]);

    return await extractOwnPrivateContent(context, url);
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Every anticipated failure path below already throws a proper
    // AppError with a static, hardcoded message - this catches anything
    // genuinely unexpected before it can reach errorHandler.ts's generic
    // console.error(error) fallback. error.message is logged (matching
    // scraperService.ts's existing pattern for unexpected tier failures);
    // Playwright's own errors reference URLs/selectors/timeouts, never raw
    // cookie/header values, so this is not expected to be able to leak the
    // session cookie - but the AppError re-throw here means the response
    // sent back to the client never includes error.message at all either
    // way, only this static string.
    console.error(
      "[privateContentService] unexpected extraction failure:",
      error instanceof Error ? error.message : "unknown error"
    );
    throw new AppError(
      "SERVER_ERROR",
      "We couldn't process this request right now. Please try again in a moment.",
      502
    );
  } finally {
    await context.close();
  }
}

async function extractOwnPrivateContent(
  context: BrowserContext,
  url: string
): Promise<InstagramPost> {
  const page = await context.newPage();

  let capturedVideoUrl: string | null = null;
  page.on("response", (response) => {
    if (capturedVideoUrl) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (contentType.includes("video")) {
      capturedVideoUrl = stripByteRangeParams(response.url());
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.waitForTimeout(POST_LOAD_WAIT_MS);

  if (page.url().includes(LOGIN_REDIRECT_MARKER)) {
    throw new AppError(
      "SESSION_EXPIRED",
      "Your session has expired. Please copy a fresh session cookie and try again.",
      401
    );
  }

  // Session-validity gate, checked before anything else about the post
  // itself - if we can't positively identify who's logged in, nothing
  // downstream can be trusted, regardless of what was requested.
  const viewer = await findViewerIdentity(page);
  if (!viewer) {
    throw new AppError(
      "SESSION_EXPIRED",
      "Your session has expired. Please copy a fresh session cookie and try again.",
      401
    );
  }

  const bodyText = await page.evaluate<string>("document.body.innerText");
  if (bodyText.includes(NOT_FOUND_MARKER)) {
    throw new AppError(
      "INVALID_URL",
      "This post could not be found. It may have been deleted or the link is incorrect.",
      404
    );
  }

  const owner = await findContentOwner(page);
  // Fail closed: a missing or unparseable owner id is treated exactly like
  // a mismatch, never like a pass. Never proceed on an unverified
  // assumption of ownership - see findContentOwner()'s doc comment on why
  // this specific extraction is not yet live-verified.
  if (!owner.id || owner.id !== viewer.id) {
    throw new AppError(
      "ACCESS_DENIED",
      "This content doesn't belong to the account you're signed in as.",
      403
    );
  }

  const meta = await readPageMeta(page);
  if (!meta.ogImage) {
    throw new AppError(
      "SERVER_ERROR",
      "We couldn't read this post right now. Please try again in a moment.",
      502
    );
  }

  const fullResImage = await findFullResolutionImage(page, meta.ogImage);
  const primaryImageUrl = fullResImage?.url ?? meta.ogImage;
  const dimensions = fullResImage
    ? { width: fullResImage.width, height: fullResImage.height }
    : { width: Number(meta.ogImageWidth) || 0, height: Number(meta.ogImageHeight) || 0 };

  const coverDate = extractCoverDate(meta.ogDescription);
  const slideImageUrls = await collectCarouselSlides(page, coverDate, primaryImageUrl);

  const progressiveVideoUrl =
    slideImageUrls.length === 1 ? await findProgressiveVideoUrl(page) : null;
  const videoUrl = slideImageUrls.length === 1 ? progressiveVideoUrl ?? capturedVideoUrl : null;

  const media: MediaItem[] = slideImageUrls.map((imageUrl) =>
    videoUrl
      ? { type: "video", url: videoUrl, thumbnail: imageUrl, dimensions }
      : { type: "image", url: imageUrl, thumbnail: imageUrl, dimensions }
  );

  const { username: parsedUsername, caption } = parseOgDescription(meta.ogDescription);
  const username = owner.username ?? parsedUsername;
  const shortcode = extractShortcode(url);

  return {
    id: shortcode,
    shortcode,
    caption,
    author: { username, full_name: username },
    media,
  };
}

/**
 * UNVERIFIED (2026-08-05): no real authenticated Instagram session was
 * available to test this against in this environment - the same
 * structural limitation as the private-account testing gap already
 * documented in docs/KNOWN_ISSUES.md (a throwaway test account can't be
 * created here either, since Instagram's signup flow requires phone/email
 * verification this environment can't provide).
 *
 * Hedges across several plausible key names Instagram's embedded relay
 * data commonly uses for the logged-in viewer's own identity, using the
 * exact same deep-search technique already proven live for video_versions
 * (findProgressiveVideoUrl in mediaExtractionHelpers.ts) - but unlike that
 * lookup, the specific key name here has NOT been confirmed against a real
 * response. Returns null (which the caller treats as SESSION_EXPIRED, a
 * fail-closed outcome) if nothing matches, rather than guessing further.
 *
 * MUST be re-verified against a real session before this is trusted as
 * correct - flagged loudly here and in docs/KNOWN_ISSUES.md rather than
 * presented as confirmed.
 */
async function findViewerIdentity(page: Page): Promise<ViewerIdentity | null> {
  return page.evaluate<ViewerIdentity | null>(`
    (() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/json"][data-sjs]')
      );
      const viewerKeys = ["viewer", "logged_in_user", "current_user", "viewerUser", "viewer_user"];

      function deepFindViewer(node, depth) {
        if (depth > 14 || node === null || typeof node !== "object") return null;
        for (const key of viewerKeys) {
          const candidate = node[key];
          if (candidate && typeof candidate === "object" && typeof candidate.id !== "undefined" && candidate.id !== null) {
            return { id: String(candidate.id), username: candidate.username ?? null };
          }
        }
        for (const key of Object.keys(node)) {
          const found = deepFindViewer(node[key], depth + 1);
          if (found) return found;
        }
        return null;
      }

      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent || "");
          const found = deepFindViewer(parsed, 0);
          if (found) return found;
        } catch {
          // Not every data-sjs script tag is well-formed JSON we care
          // about - skip and keep searching the rest.
        }
      }
      return null;
    })()
  `);
}

/**
 * UNVERIFIED for the same reason as findViewerIdentity() above - flagged
 * loudly rather than presented as confirmed. Instagram's xdt_shortcode_media
 * GraphQL shape is already confirmed live (via instagramUrlDirectTier.ts's
 * formatPostInfo, which reads requestData.owner.username/is_private from
 * an anonymous, unauthenticated request) to put `owner` as a field on the
 * media object. The assumption here - not yet live-tested - is that the
 * same field also carries a numeric `id`, reachable via the same
 * data-sjs deep-search already proven for video_versions. Returns
 * { id: null, username: null } (which the caller's fail-closed comparison
 * treats as a mismatch) rather than guessing further if nothing is found.
 */
async function findContentOwner(page: Page): Promise<ContentOwner> {
  const result = await page.evaluate<ContentOwner | null>(`
    (() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/json"][data-sjs]')
      );

      function deepFindOwner(node, depth) {
        if (depth > 14 || node === null || typeof node !== "object") return null;
        if (
          node.owner &&
          typeof node.owner === "object" &&
          typeof node.owner.id !== "undefined" &&
          node.owner.id !== null
        ) {
          return { id: String(node.owner.id), username: node.owner.username ?? null };
        }
        for (const key of Object.keys(node)) {
          const found = deepFindOwner(node[key], depth + 1);
          if (found) return found;
        }
        return null;
      }

      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent || "");
          const found = deepFindOwner(parsed, 0);
          if (found) return found;
        } catch {
          // Not every data-sjs script tag is well-formed JSON we care
          // about - skip and keep searching the rest.
        }
      }
      return null;
    })()
  `);
  return result ?? { id: null, username: null };
}

export const privateContentService = { fetchOwnPrivateContent };
