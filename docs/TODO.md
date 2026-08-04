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
- [ ] Give `packages/types` a real build step before the API Dockerfile can actually run in production — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#deployment-gap-packagestypes-has-no-build-step)

## Day 3 — Client integration & security
- [x] Wire React Query hooks (`useInstagramDownloader`) to `/api/v1/fetch` — hook is live and calling the real endpoint, now returns real data for public posts
- [x] Loading skeletons + error toasts
- [ ] Verify `express-rate-limit` enforces 10 req / 10 min / IP on the running API

## Day 4 — SEO, PWA & performance
- [ ] JSON-LD `WebApplication` schema
- [ ] OG/Twitter card images
- [ ] Service worker + PWA installability
- [ ] Lighthouse audit pass (>95)

## Day 5 — QA, testing & deployment
- [ ] Deploy `apps/web` to Vercel, `apps/api` to Railway
- [ ] Custom domain + SSL
- [ ] End-to-end smoke test of the full [Pre-production readiness checklist](./DEPLOYMENT.md#pre-production-readiness-checklist)

## Future scaling (not MVP)
- [ ] If `apps/api` moves to multiple Railway instances, replace `express-rate-limit` (in-memory) with a distributed rate limiter (e.g. Upstash Redis, sliding window) — in-memory counters don't sync across instances and the effective limit multiplies with instance count. See [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp) and [SECURITY.md](./SECURITY.md#rate-limiting).
