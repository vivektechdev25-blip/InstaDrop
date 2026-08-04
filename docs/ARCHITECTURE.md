# Architecture

## System diagram

```
User / Browser
      |
      v
Frontend — Vercel Edge (Next.js 14, TypeScript, Tailwind + shadcn/ui)
  |-- URL Input Handler       (regex validation, clipboard paste, param cleanup)
  |-- Preview Card            (video player, carousel swiper)
  |-- Binary Download         (Content-Disposition trigger)
  `-- State Management        (IDLE -> VALIDATING -> FETCHING -> SUCCESS/ERROR/RATE_LIMITED)
      |
      v
Backend API — Railway (Node.js 20 + Express, Docker)
  |-- Scraper Engine          (multi-tier fallback scrapers)
  |-- Rate Limiter            (express-rate-limit, in-memory, single instance)
  |-- Security Layer          (Helmet, Zod validation, CORS)
  `-- API Routes              (/api/v1/fetch, /api/v1/download)
      |
      v
Data & Infra Layer
  |-- Supabase PostgreSQL     (request_logs — no PII, hashed IPs only)
  `-- Vercel Edge Cache       (s-maxage=3600, stale-while-revalidate=59)
      |
      v
Instagram CDN (external — scraped via proxy, media never stored on our servers)
```

## Key architectural rule

Instadrop never stores Instagram media on its own servers. All media is proxy-streamed directly to the user's browser.

## Folder structure

```
instadrop-monorepo/
|-- apps/
|   |-- web/     Next.js frontend (App Router)
|   `-- api/     Express backend microservice (Dockerized)
|-- packages/
|   `-- types/   Shared TypeScript DTOs (frontend + backend)
|-- docs/        This documentation set
|-- scripts/     Build/deploy/dev scripts
`-- config/      Shared configs (eslint, prettier, tsconfig base)
```

**Rule:** Never create "God Components" or "God Functions." One file = one responsibility. All business logic lives in `services/` — controllers stay thin and only orchestrate.

## Tech stack

### Frontend
- Next.js 14+ (App Router, Server Actions), TypeScript strict mode
- Tailwind CSS + shadcn/ui (Radix primitives), Framer Motion
- TanStack React Query v5 + Axios

### Backend
- Node.js 20 LTS + Express.js (TypeScript)
- `express-rate-limit` (in-memory) for rate limiting
- Supabase PostgreSQL for audit/anonymous request logs only
- Hosting: Vercel (frontend) + Railway (backend API, Dockerized)
- PNPM monorepo workspace

### Rate limiting: in-memory for MVP

`express-rate-limit` runs in-memory, per Railway instance, enforcing 10 requests / 10 minutes / IP. This is intentional for the MVP: the backend deploys as a single Railway instance, so there is no cross-instance state to synchronize, and it avoids the cost/operational overhead of a Redis dependency (previously Upstash) before it's needed.

**Revisit at scale:** if `apps/api` ever scales to multiple Railway instances, in-memory counters no longer share state across instances and the limit becomes effectively `N × 10 req / 10 min / IP`. At that point, switch back to a distributed store (e.g. Upstash Redis with a sliding-window algorithm) so the limit holds across instances. Tracked in [TODO.md](./TODO.md).

### Scraper tiers: instagram-url-direct (fast), Playwright (fallback)

Decision made 2026-08-04, after live-testing showed every anonymous, session-less scraping approach fails against current Instagram (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)):

- **Tier 1 (`apps/api/src/services/scrapers/instagramUrlDirectTier.ts`):** the `instagram-url-direct` npm package, which replays Instagram's internal persisted-query GraphQL call. Fast when it works (sub-second), but the persisted `doc_id` it hardcodes can go stale without warning — live-tested and confirmed to fail this way even against a real, currently-public post.
- **Tier 2 (`apps/api/src/services/scrapers/playwrightTier.ts`):** headless Chromium renders the real post page and reads Instagram's own server-rendered `og:` meta tags (image + caption), plus intercepts the first `video/mp4` network response for video posts. Confirmed live to work where plain HTTP scraping (even with a browser-matching User-Agent) does not — Instagram's bot detection filters on more than the UA string, and a real browser context gets past it.

**Explicitly rejected** (per product decision, not a technical dead end): a paid third-party scraping API (breaks the near-zero-cost MVP budget in [DEPLOYMENT.md](./DEPLOYMENT.md#cost-projections) and sends every submitted URL to a third party) and an own-account session-cookie pool (repurposes the private-account-own-content mechanism in [SECURITY.md](./SECURITY.md) to scrape *other people's* public content at scale — a materially different ToS/ban risk the spec never discussed).

**Latency:** the spec's <800ms extraction target ([PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)) applies only to the Tier 1 success path. Tier 2 launches a real browser and waits for the page to render — confirmed live at ~4-5 seconds per request. This is an accepted tradeoff: reliability over raw speed for the fallback path, since Tier 1 alone is not dependable enough to be the only tier.

