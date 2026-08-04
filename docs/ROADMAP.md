# Roadmap

## 5-Day MVP build workflow

| Day | Phase | Deliverables |
|---|---|---|
| 1 | Environment & frontend shell | PNPM monorepo setup, Next.js config, Tailwind/shadcn install, hero section, URL input form |
| 2 | Backend parsing API | Express server, Instagram scraper service, proxy bypass pipeline, `/api/v1/fetch` and `/api/v1/download` |
| 3 | Client integration & security | React Query hooks, loading skeletons, express-rate-limit, Helmet middleware, error toasts |
| 4 | SEO, PWA & performance | JSON-LD schema, OG/Twitter cards, PWA service worker + install prompt system, Lighthouse audit (>95) |
| 5 | QA, testing & deployment | Vercel + Railway deploy, custom DNS/SSL, end-to-end smoke testing |

## Post-MVP roadmap

- Stories / Highlights parser
- Profile bulk downloader
- Browser extension
- User search history
- Enterprise REST API
- Private account support (own content only, session-cookie approach — see [SECURITY.md](./SECURITY.md))
- `InstallBanner` (lower-priority alternative to `InstallModal` — build only if time allows)
- iOS Safari instructional install fallback (explicitly deferred — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md))

## Current status (2026-08-04)

MVP build is substantially underway, not "not started": frontend + backend scaffolding, the two-tier scraper, SEO/JSON-LD, rate limiting, responsive verification, and the PWA service worker + install prompt system have all landed and been live-verified — see [FEATURES.md](./FEATURES.md) for the up-to-date feature checklist and [CHANGELOG.md](./CHANGELOG.md) for what's shipped so far. Deployment (Day 5) has not started — paused intentionally, see [DEPLOYMENT.md](./DEPLOYMENT.md).
