import { chromium, type Browser, type BrowserContext } from "playwright";
import { AppError } from "../../errors/AppError";
import { USER_AGENT, VIEWPORT } from "./mediaExtractionHelpers";

let browserPromise: Promise<Browser> | null = null;

// Both flags exist for containerized hosting (Render/Railway/Docker), not
// local dev - but they're applied unconditionally because they're harmless
// on a developer machine and conditionally-applied launch flags are exactly
// the kind of thing that works locally and then fails only in production.
//
// --disable-dev-shm-usage: container runtimes mount /dev/shm at 64MB by
//   default. Chromium uses that shared-memory region for renderer state and
//   crashes ("Target page/context/browser has been closed") partway through
//   loading a real, image-heavy Instagram page once it fills. This flag
//   moves that allocation to /tmp instead.
// --no-sandbox: this image runs as root (the Dockerfile adds no non-root
//   user), and Chromium's setuid sandbox refuses to start under root. The
//   usual objection to this flag - that it removes a hardening layer around
//   untrusted page content - is bounded here: the only URLs ever navigated
//   to are Instagram post URLs already validated by fetchMediaSchema, never
//   arbitrary user-supplied hosts.
const CONTAINER_SAFE_ARGS = ["--disable-dev-shm-usage", "--no-sandbox"];

// Chromium is the memory ceiling on this service, not Node: a real
// image-heavy Instagram page in a fresh browser context costs far more
// than the Express process around it, and docs/DEPLOYMENT.md records that
// Render's smaller instances OOM-kill the browser mid-scrape. Requests
// past this cap wait for a slot instead of opening another context and
// pushing the instance over that ceiling.
const MAX_CONCURRENT_CONTEXTS = 2;
// Past this, waiting is pointless rather than merely slow: the frontend's
// own axios timeout (30s) would expire before the queue drained, so the
// caller gets a fast, honest 503 instead of a connection held open for
// work nobody is still waiting for.
const MAX_QUEUED_REQUESTS = 8;

let activeContexts = 0;
const slotWaiters: Array<() => void> = [];

/**
 * Lazily launches the shared browser, and - this is the part that matters -
 * un-caches it the moment it dies.
 *
 * The previous version cached `browserPromise` for the lifetime of the
 * process and only ever cleared it in closeBrowser(). When Chromium was
 * OOM-killed mid-scrape (a documented, expected event on small container
 * instances - see docs/DEPLOYMENT.md), the Node process itself survived,
 * so no platform health check failed and no restart happened: getBrowser()
 * kept handing out the same dead Browser object and every subsequent
 * Tier 2 scrape failed with "Target page/context/browser has been closed"
 * until someone manually restarted the service. A rejected launch was
 * cached the same way, making a single transient launch failure permanent.
 *
 * The identity check in invalidate() matters: by the time a 'disconnected'
 * event fires, a later request may already have cached a fresh, healthy
 * launch, and clearing that one would throw away a working browser.
 */
export function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;

  const pending: Promise<Browser> = chromium
    .launch({ headless: true, args: CONTAINER_SAFE_ARGS })
    .then((browser) => {
      browser.on("disconnected", () => invalidate(pending));
      return browser;
    })
    .catch((error) => {
      invalidate(pending);
      throw error;
    });

  browserPromise = pending;
  return pending;
}

function invalidate(stale: Promise<Browser>): void {
  if (browserPromise === stale) {
    browserPromise = null;
  }
}

async function acquireContextSlot(): Promise<void> {
  if (activeContexts < MAX_CONCURRENT_CONTEXTS) {
    activeContexts += 1;
    return;
  }

  if (slotWaiters.length >= MAX_QUEUED_REQUESTS) {
    throw new AppError(
      "SERVER_ERROR",
      "We're handling too many requests right now. Please try again in a moment.",
      503
    );
  }

  // Resolved by releaseContextSlot(), which hands its slot straight over
  // rather than decrementing - so the count can never drift above the cap
  // between one request finishing and the next waking up.
  await new Promise<void>((resolve) => slotWaiters.push(resolve));
}

function releaseContextSlot(): void {
  const nextWaiter = slotWaiters.shift();
  if (nextWaiter) {
    nextWaiter();
    return;
  }
  activeContexts -= 1;
}

/**
 * The one way to get a browser context in this service. Owns the whole
 * lifecycle - concurrency slot, context creation with the shared
 * UA/viewport, and closing the context no matter how `run` exits - so no
 * caller can leak a context on an error path, and both scraping flows
 * (public Playwright tier, own-private-content) share one cap rather than
 * each opening contexts independently.
 */
export async function withBrowserContext<T>(
  run: (context: BrowserContext) => Promise<T>
): Promise<T> {
  await acquireContextSlot();

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
    });

    try {
      return await run(context);
    } finally {
      // A context belonging to an already-dead browser throws here; the
      // scrape's own outcome is what matters, so never let cleanup
      // replace it with a less useful error.
      await context.close().catch(() => {});
    }
  } finally {
    releaseContextSlot();
  }
}

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  if (!pending) return;
  browserPromise = null;

  // Shutdown path: a launch that failed, or a browser that already died,
  // must not throw here - app.ts awaits this before closing the server,
  // and a rejection would leave the process hanging instead of exiting.
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // Nothing left to close.
  }
}
