import { chromium, type Browser } from "playwright";

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

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, args: CONTAINER_SAFE_ARGS });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
