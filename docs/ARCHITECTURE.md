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
