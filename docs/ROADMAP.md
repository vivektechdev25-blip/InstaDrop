# Roadmap

## 5-Day MVP build workflow

| Day | Phase | Deliverables |
|---|---|---|
| 1 | Environment & frontend shell | PNPM monorepo setup, Next.js config, Tailwind/shadcn install, hero section, URL input form |
| 2 | Backend parsing API | Express server, Instagram scraper service, proxy bypass pipeline, `/api/v1/fetch` and `/api/v1/download` |
| 3 | Client integration & security | React Query hooks, loading skeletons, express-rate-limit, Helmet middleware, error toasts |
| 4 | SEO, PWA & performance | JSON-LD schema, OG/Twitter cards, PWA service worker, Lighthouse audit (>95) |
| 5 | QA, testing & deployment | Vercel + Railway deploy, custom DNS/SSL, end-to-end smoke testing |

## Post-MVP roadmap

- Stories / Highlights parser
- Profile bulk downloader
- Browser extension
- User search history
- Enterprise REST API
- Private account support (own content only, session-cookie approach — see [SECURITY.md](./SECURITY.md))

## Current status

Repository scaffolding complete (monorepo structure, doc set, empty app/API skeletons). Day 1 implementation has not started yet.
