# TODO

Active task list. Keep this current — remove items once shipped and note them in [CHANGELOG.md](./CHANGELOG.md) instead.

## Day 1 — Environment & frontend shell
- [ ] Install dependencies (`pnpm install`) and verify `apps/web` builds
- [ ] Build hero section
- [ ] Wire up `InputForm` component with URL validation and clipboard paste
- [ ] Implement dark/light theme toggle (`useTheme` hook)

## Day 2 — Backend parsing API
- [ ] Implement `scraperService.extractMedia` (multi-tier fallback pipeline)
- [ ] Implement `downloadService.streamToResponse`
- [ ] Verify `/api/v1/fetch` and `/api/v1/download` end-to-end against a real public post

## Day 3 — Client integration & security
- [ ] Wire React Query hooks (`useInstagramDownloader`) to `/api/v1/fetch`
- [ ] Loading skeletons + error toasts
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
