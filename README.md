# Instadrop

A high-performance, privacy-focused, zero-friction web application for parsing, previewing, and downloading **public** Instagram media — photos, reels, videos, carousels, and IGTV. No login, no registration, no paywalls.

See [docs/PROJECT_OVERVIEW.md](./docs/PROJECT_OVERVIEW.md) for the full product vision and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system design.

## Monorepo layout

```
apps/web       Next.js 14 frontend (App Router, TypeScript, Tailwind + shadcn/ui)
apps/api       Express backend microservice (TypeScript, Dockerized)
packages/types Shared TypeScript DTOs (frontend + backend)
docs/          Full documentation set (see below)
config/        Shared configs (tsconfig base, etc.)
scripts/       Build/deploy/dev scripts
```

## Prerequisites

- Node.js 20 LTS
- PNPM 9+ (`corepack enable` recommended)

## Getting started

```bash
pnpm install

# copy env templates and fill in real values
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# run the frontend
pnpm dev:web

# run the backend API
pnpm dev:api
```

## Documentation

| File | Purpose |
|---|---|
| [PROJECT_OVERVIEW.md](./docs/PROJECT_OVERVIEW.md) | Product vision, target users, objectives |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, diagrams, data flow |
| [FEATURES.md](./docs/FEATURES.md) | Feature list, MVP vs post-MVP |
| [ROADMAP.md](./docs/ROADMAP.md) | Timeline, phases, future plans |
| [CHANGELOG.md](./docs/CHANGELOG.md) | Version history |
| [DATABASE.md](./docs/DATABASE.md) | Schema, tables, relationships |
| [API.md](./docs/API.md) | Endpoint specs, request/response formats |
| [SECURITY.md](./docs/SECURITY.md) | Security measures, threat model |
| [SEO.md](./docs/SEO.md) | Metadata strategy, structured data |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Deploy process, environments, CI/CD |
| [TESTING.md](./docs/TESTING.md) | Testing strategy, edge cases |
| [TODO.md](./docs/TODO.md) | Active task list |
| [KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md) | Bugs, limitations, workarounds |
| [CONTRIBUTING.md](./docs/CONTRIBUTING.md) | Contribution guidelines |

## Status

MVP build is well underway: scraper, SEO, rate limiting, responsive UI, and PWA support (installable app shell + an install prompt with `InstallModal`/`InstallButton`) have all landed and been live-verified. See [docs/ROADMAP.md](./docs/ROADMAP.md) for current status and [docs/TODO.md](./docs/TODO.md) for the active task list.
