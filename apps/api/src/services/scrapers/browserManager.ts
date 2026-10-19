import { chromium, type Browser, type BrowserContext } from "playwright";
import type { RegionProxy } from "../../config/env";
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

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Chromium is the memory ceiling on this service, not Node. Measured
// 2026-10-15 in the production image, 512MB container, 20 concurrent
// /fetch requests: two live contexts drove the container to 99.4% of its
// memory limit, /health stopped answering entirely, and it never recovered
// - which is exactly what a platform health check sees as a crash.
//
// Measured again with the load shedding below in place, same burst, same
// container: two contexts still peaked at 503.8MB of 512MB - a 1.6% margin -
// while one peaked at 337MB, a 34% margin. Both recovered, but only one of
// them has room for the container to be doing anything else at the time.
//
// One context costs throughput only under concurrent load; a single user
// waiting on a single reel is unaffected either way. Raise it with
// SCRAPER_MAX_CONCURRENCY=2 on an instance with 1GB or more.
const MAX_CONCURRENT_CONTEXTS = readPositiveInt(process.env.SCRAPER_MAX_CONCURRENCY, 1);

// Queue depth is a promise about waiting time, not a buffer to hide behind.
// A scrape takes roughly 20-30s, so with the old depth of 8 a queued caller
// waited up to ~5 minutes; the frontend gives up after 30s, so most of that
// queue was work being done for callers who had already left - while still
// holding the memory that killed the container. Depth is now small enough
// that anything accepted can plausibly still be wanted when it runs.
const MAX_QUEUED_REQUESTS = readPositiveInt(process.env.SCRAPER_MAX_QUEUED, 3);

// And even inside that queue, waiting is bounded: past this the honest
// answer is "we're busy", returned immediately, rather than a connection
// held open past the client's own timeout.
const QUEUE_WAIT_TIMEOUT_MS = readPositiveInt(process.env.SCRAPER_QUEUE_WAIT_MS, 10_000);

// A scrape that hangs holds its slot forever and starves every queued
// caller behind it. Navigation and page waits have their own timeouts, but
// nothing bounded the whole operation until now.
const SCRAPE_TIMEOUT_MS = readPositiveInt(process.env.SCRAPER_TIMEOUT_MS, 45_000);

// Chromium does not give memory back to the container the way a Node heap
// does: after the burst above, eight chrome-headless processes still held
// ~345MB with no contexts open. Relaunching the browser periodically
// reclaims that; it costs one launch (~1s) per N scrapes.
const MAX_CONTEXTS_PER_BROWSER = readPositiveInt(process.env.SCRAPER_BROWSER_RECYCLE_AFTER, 40);

interface SlotWaiter {
  grant: () => void;
  cancel: (error: AppError) => void;
}

let activeContexts = 0;
let contextsSinceLaunch = 0;
const slotWaiters: SlotWaiter[] = [];

function busyError(): AppError {
  return new AppError(
    "SERVER_ERROR",
    "We're handling too many requests right now. Please try again in a moment.",
    503
  );
}

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
  contextsSinceLaunch = 0;
  return pending;
}

function invalidate(stale: Promise<Browser>): void {
  if (browserPromise === stale) {
    browserPromise = null;
  }
}

/**
 * Waits for a concurrency slot, but never longer than the caller can still
 * use it: the wait ends early if the queue is full, if the deadline passes,
 * or if the client has already disconnected.
 */
async function acquireContextSlot(signal?: AbortSignal, priority = false): Promise<void> {
  if (signal?.aborted) throw busyError();

  if (activeContexts < MAX_CONCURRENT_CONTEXTS) {
    activeContexts += 1;
    return;
  }

  // A priority caller is the second half of a request this service already
  // accepted (the region re-read): it waits only for the scrape running now,
  // not behind newer requests, and the queue limit - a promise to new
  // callers about waiting time - does not turn it away.
  if (!priority && slotWaiters.length >= MAX_QUEUED_REQUESTS) {
    throw busyError();
  }

  await new Promise<void>((resolve, reject) => {
    const waiter: SlotWaiter = {
      grant: () => {
        cleanup();
        resolve();
      },
      cancel: (error) => {
        cleanup();
        reject(error);
      },
    };

    const timer = setTimeout(() => remove(waiter)?.cancel(busyError()), QUEUE_WAIT_TIMEOUT_MS);
    const onAbort = (): void => remove(waiter)?.cancel(busyError());

    function cleanup(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    if (priority) slotWaiters.unshift(waiter);
    else slotWaiters.push(waiter);
  });
}

/** Takes a waiter out of the queue, returning it only if it was still there. */
function remove(waiter: SlotWaiter): SlotWaiter | null {
  const index = slotWaiters.indexOf(waiter);
  if (index === -1) return null;
  slotWaiters.splice(index, 1);
  return waiter;
}

function releaseContextSlot(): void {
  // Hands the slot straight over rather than decrementing, so the count can
  // never drift above the cap between one request finishing and the next
  // waking up.
  const nextWaiter = slotWaiters.shift();
  if (nextWaiter) {
    nextWaiter.grant();
    return;
  }
  activeContexts -= 1;
}

/** Closes the browser once it is idle, so the next scrape gets a fresh one. */
async function recycleBrowserIfIdle(): Promise<void> {
  if (activeContexts > 0 || slotWaiters.length > 0) return;
  if (contextsSinceLaunch < MAX_CONTEXTS_PER_BROWSER) return;
  await closeBrowser();
}

/**
 * The one way to get a browser context in this service. Owns the whole
 * lifecycle - concurrency slot, context creation with the shared
 * UA/viewport, and closing the context no matter how `run` exits - so no
 * caller can leak a context on an error path, and both scraping flows
 * (public Playwright tier, own-private-content) share one cap rather than
 * each opening contexts independently.
 *
 * Pass the request's `signal` so that a caller who has already given up
 * stops costing memory: a disconnected client's queued request is dropped
 * instead of being handed a browser nobody is waiting for.
 */
export async function withBrowserContext<T>(
  run: (context: BrowserContext) => Promise<T>,
  {
    signal,
    proxy,
    priority = false,
  }: { signal?: AbortSignal; proxy?: RegionProxy | null; priority?: boolean } = {}
): Promise<T> {
  await acquireContextSlot(signal, priority);

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
      // Per context, not per browser: only the region-recovery page load
      // goes through the proxy, everything else stays direct, and both
      // share the one Chromium a small container can afford.
      ...(proxy
        ? {
            proxy: {
              server: proxy.server,
              ...(proxy.username ? { username: proxy.username } : {}),
              ...(proxy.password ? { password: proxy.password } : {}),
            },
          }
        : {}),
    });
    contextsSinceLaunch += 1;

    try {
      return await withTimeout(run(context));
    } finally {
      // A context belonging to an already-dead browser throws here; the
      // scrape's own outcome is what matters, so never let cleanup
      // replace it with a less useful error.
      await context.close().catch(() => {});
    }
  } finally {
    releaseContextSlot();
    await recycleBrowserIfIdle().catch(() => {});
  }
}

/** Fails a scrape that outlives its budget, so its slot is not held forever. */
async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppError(
                "SERVER_ERROR",
                "This post took too long to load. Please try again.",
                504
              )
            ),
          SCRAPE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  if (!pending) return;
  browserPromise = null;
  contextsSinceLaunch = 0;

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

/** Exposed for tests and for the readiness probe. */
export function getPoolState(): {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueued: number;
} {
  return {
    active: activeContexts,
    queued: slotWaiters.length,
    maxConcurrent: MAX_CONCURRENT_CONTEXTS,
    maxQueued: MAX_QUEUED_REQUESTS,
  };
}
