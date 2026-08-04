# TODO

Active task list. Keep this current — remove items once shipped and note them in [CHANGELOG.md](./CHANGELOG.md) instead.

## Day 1 — Environment & frontend shell
- [x] Install dependencies (`pnpm install`) and verify `apps/web` builds
- [x] Build hero section
- [x] Wire up `InputForm` component with URL validation and clipboard paste
- [x] Implement dark/light theme toggle (`useTheme` hook)

## Day 2 — Backend parsing API
- [ ] Implement `scraperService.extractMedia` (multi-tier fallback pipeline) — **blocked on a scraping-method decision, see below**
- [ ] Implement `downloadService.streamToResponse`
- [ ] Verify `/api/v1/fetch` and `/api/v1/download` end-to-end against a real public post

## Day 3 — Client integration & security
- [x] Wire React Query hooks (`useInstagramDownloader`) to `/api/v1/fetch` — hook is live and calling the real endpoint; currently always resolves to `SERVER_ERROR` since `scraperService` is still a stub
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

## Open decision — scraper primary/fallback tiers
Live testing (2026-08-04) confirmed the "easy" anonymous scraping tiers (legacy `?__a=1&__d=dis`, plain page HTML, `/embed/captioned/`, unauthenticated internal GraphQL) all fail against current Instagram — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). `scraperService.extractMedia` is blocked until a scraping strategy is chosen.

## Future scaling (not MVP)
- [ ] If `apps/api` moves to multiple Railway instances, replace `express-rate-limit` (in-memory) with a distributed rate limiter (e.g. Upstash Redis, sliding window) — in-memory counters don't sync across instances and the effective limit multiplies with instance count. See [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp) and [SECURITY.md](./SECURITY.md#rate-limiting).
