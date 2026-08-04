# SEO

SEO is built in from day one, not an afterthought.

## Requirements

- Metadata (title/description) per page via Next.js `Metadata` API — see `apps/web/src/app/layout.tsx`
- OpenGraph and Twitter Card tags
- Canonical URLs
- `robots.txt` — generated dynamically via `apps/web/src/app/robots.ts` (Next.js file convention), not a static file, so it always agrees with `siteConfig.url`
- `sitemap.xml` — generated via `apps/web/src/app/sitemap.ts`
- JSON-LD structured data using the `WebApplication` schema — see `apps/web/src/app/layout.tsx`
- OG image — auto-generated via `apps/web/src/app/opengraph-image.tsx` (Next.js `next/og` convention); Next.js wires the `og:image`/`twitter:image` meta tags to it automatically
- PWA manifest — see `apps/web/public/manifest.json`

## Site config

`apps/web/src/lib/siteConfig.ts` is the single source of truth for the site's canonical URL (`NEXT_PUBLIC_SITE_URL`, defaults to `https://instadrop.app`), name, and description — reused by `layout.tsx`, `sitemap.ts`, and `robots.ts` so they can't drift out of sync with each other.

## Targets

- Lighthouse SEO/Performance score > 95 — **achieved**: Performance 99, SEO 100, Accessibility 100, Best Practices 100 (real Lighthouse run against a production build, see [TESTING.md](./TESTING.md#lighthouse-audit-2026-08-04))
- LCP < 1.5s, FID < 100ms, CLS < 0.05 — CLS 0 and TBT 20ms are comfortably within target. LCP is **methodology-dependent**, investigated in full — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#lcp-investigation-2026-08-04-resolved-as-a-measurement-methodology-issue-not-a-code-defect).

## Status

Implemented and confirmed live (production build + `next start`, not just typechecking):
- `GET /robots.txt` — correct `Allow: /` + `Sitemap:` pointing at `siteConfig.url`
- `GET /sitemap.xml` — all four routes (home + 3 legal pages) present with correct `<loc>`
- `GET /opengraph-image` — valid 1200x630 PNG (confirmed via `file`)
- Home page `<head>` — canonical `<link>`, full `og:*`/`twitter:*` tags (including the auto-wired image), and valid `WebApplication` JSON-LD, all confirmed present in the actual rendered HTML

Per-page metadata for the legal pages is still generic (inherits the root layout's title/description) — will be filled in alongside their real content ([TODO.md](./TODO.md)).

## PWA

- `apps/web/public/manifest.json` — name, icons (192/512 PNG + a maskable 512 variant, generated to match the brand mark), `display: standalone`, theme/background colors.
- `apps/web/public/sw.js` — hand-rolled service worker (not a library): network-first for navigations (always latest when online, falls back to the cached shell offline), cache-first for everything else (JS/CSS chunks, icons), populating the cache as assets are fetched.
- `apps/web/src/hooks/useServiceWorker.ts` registers it, gated to production only (service workers fight with dev-mode hot-reload, a well-known footgun — confirmed intentional, not an oversight).

**Confirmed live** (production build, real Chromium via Playwright, not just code review):
- Service worker registers and reaches `activated` state, zero console errors
- App shell (`/`, JS/CSS chunks, prefetched legal pages) actually populates the cache
- **Actually went offline** (`context.setOffline(true)`) and reloaded — the real UI still rendered from cache, not just an inference from "the code looks right"

Not independently verified: the literal browser "Add to Home Screen" install prompt UI (`beforeinstallprompt`), since that requires a full browser session rather than headless automation. All of the underlying technical criteria Chrome checks before offering that prompt — valid manifest with icons/name/start_url/display, served over HTTPS or localhost, a registered service worker with a fetch handler — are confirmed met. A custom `InstallModal` now wraps this event (see [ARCHITECTURE.md](./ARCHITECTURE.md#pwa-install-prompt-system)) and has been fully verified against a synthetic version of the event; the real-browser confirmation that Chrome actually fires it against this app remains the one pending manual step — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#real-browser-beforeinstallprompt-confirmation-pending-manual-not-fabricated).
