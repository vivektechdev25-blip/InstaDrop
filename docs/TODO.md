# TODO

Active task list. Keep this current — remove items once shipped and note them in [CHANGELOG.md](./CHANGELOG.md) instead.

## Day 1 — Environment & frontend shell
- [x] Install dependencies (`pnpm install`) and verify `apps/web` builds
- [x] Build hero section
- [x] Wire up `InputForm` component with URL validation and clipboard paste
- [x] Implement dark/light theme toggle (`useTheme` hook)

## Day 2 — Backend parsing API
- [x] Implement `scraperService.extractMedia` (multi-tier fallback pipeline) — Tier 1 `instagram-url-direct`, Tier 2 Playwright, see [ARCHITECTURE.md](./ARCHITECTURE.md#scraper-tiers-instagram-url-direct-fast-playwright-fallback)
- [x] Implement `downloadService.streamToResponse` — SSRF-guarded to Instagram CDN hosts only
- [x] Verify `/api/v1/fetch` end-to-end against real public posts — image post and reel both confirmed live (real caption/author/media URL, video file downloads complete and valid); not-found path confirmed live (`INVALID_URL`); private-account path implemented but **not** live-verified, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [x] Verify `/api/v1/download` end-to-end — confirmed live for real image and video CDN URLs (correct headers, complete valid files); SSRF guard confirmed rejecting non-Instagram-CDN URLs
- [ ] QA carousel extraction against a real multi-slide post (implemented but unverified, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md))
- [ ] QA private-account detection against a real private post (implemented but unverified, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md))
- [x] Give `packages/types` a real build step before the API Dockerfile can actually run in production — `tsc` now emits to `dist/`, `main`/`types` point there, a `prepare` script builds it automatically on `pnpm install`. Confirmed live: `docker build` succeeds and the built container actually runs and serves real requests (Zod, `@instadrop/types` resolution, and Playwright/Chromium scraping a real Instagram URL all confirmed working inside the container) — took four rounds of real bugs found via `docker build`/`docker run`, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
- [x] Fix Tier 2 (Playwright) image resolution — confirmed live: recovered 1350x1688 (340KB) from what was a 640x640 (25KB) cropped `og:image`, verified by downloading the actual file and checking its real pixel dimensions. See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#tier-2-playwright-image-quality-gap-fixed-2026-08-04)

## Day 3 — Client integration & security
- [x] Wire React Query hooks (`useInstagramDownloader`) to `/api/v1/fetch` — hook is live and calling the real endpoint, now returns real data for public posts
- [x] Loading skeletons + error toasts
- [x] Build `PreviewCard` (video player, carousel swiper, per-slide download) and wire the real download trigger — confirmed live in an actual browser (Playwright screenshot) for both image and reel posts; carousel UI built but untestable until a real carousel post is found, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [x] Verify `express-rate-limit` enforces 10 req / 10 min / IP on the running API — confirmed live: 12 rapid requests to `/api/v1/fetch` allowed the first 10 and returned `429` with `RateLimit-*`/`Retry-After` headers and `code: "RATE_LIMITED"` on requests 11-12

## Day 4 — SEO, PWA & performance
- [x] JSON-LD `WebApplication` schema — confirmed live in the rendered `<head>`
- [x] OG/Twitter card images — auto-generated via `opengraph-image.tsx`, confirmed live (valid 1200x630 PNG) and correctly wired into `og:image`/`twitter:image` meta tags
- [x] `robots.txt` + `sitemap.xml` via Next.js file conventions, confirmed live with a production build (`next build && next start`)
- [x] Per-page metadata for legal pages — added alongside their real content below
- [x] Service worker + PWA installability — hand-rolled `sw.js` (network-first navigations, cache-first assets) + real icon files (manifest had `icons: []`, would have failed installability). Confirmed live: registers/activates with zero console errors, and actually tested offline (`setOffline(true)` + reload) — the real UI rendered from cache. See [SEO.md](./SEO.md#pwa) for what's confirmed vs. inferred (the literal "Add to Home Screen" prompt UI isn't testable headless).
- [x] Lighthouse audit pass (>95) — Performance 99, Accessibility 100, Best Practices 100, SEO 100 against a real production build. First run scored Accessibility 96 (16x16px icon-only "paste" button failed the 24x24px touch-target minimum); fixed that plus the same underlying issue in `PreviewCard`'s carousel dots, re-ran and confirmed 100. See [TESTING.md](./TESTING.md#lighthouse-audit-2026-08-04).
- [x] LCP investigated properly (pulled the real LCP breakdown, ruled out fonts/hero-image/critical-CSS/third-party-scripts, confirmed via 3 separate Lighthouse runs) — the 2.2s figure was Lighthouse CLI's default `simulate` throttling mode overestimating delay on this lean, mostly-static page. Under directly-applied identical throttling (`devtools` method), LCP is 1.475s, meeting target, with Performance 100. No code change was needed or made. See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#lcp-investigation-2026-08-04-resolved-as-a-measurement-methodology-issue-not-a-code-defect).
- [x] Dynamic imports for non-critical JS — `PreviewCard` (not needed until a fetch succeeds) and `MobileNav` (framer-motion, not needed until opened) both moved to `next/dynamic({ ssr: false })`. Confirmed via production build: home page First Load JS dropped from 165KB to 128KB (~22%).
- [x] Keyboard nav + ARIA pass — confirmed via a real Lighthouse audit (100 accessibility) plus a manual Playwright-driven keyboard `Tab`-order check: logical order (logo → nav → theme toggle → URL input → paste button → footer), disabled submit button correctly excluded from tab order until the field has a value.

## Day 5 — QA, testing & deployment
- [ ] Deploy `apps/web` to Vercel, `apps/api` to Railway
- [ ] Custom domain + SSL
- [ ] End-to-end smoke test of the full [Pre-production readiness checklist](./DEPLOYMENT.md#pre-production-readiness-checklist)

## Future scaling (not MVP)
- [ ] If `apps/api` moves to multiple Railway instances, replace `express-rate-limit` (in-memory) with a distributed rate limiter (e.g. Upstash Redis, sliding window) — in-memory counters don't sync across instances and the effective limit multiplies with instance count. See [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp) and [SECURITY.md](./SECURITY.md#rate-limiting).
