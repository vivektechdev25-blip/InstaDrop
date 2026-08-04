# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Initial monorepo scaffolding: `apps/web` (Next.js), `apps/api` (Express), `packages/types` (shared DTOs)
- Documentation set under `docs/`
- Root workspace config (`pnpm-workspace.yaml`, shared `tsconfig.base.json`, `.gitignore`)

### Changed
- Rate limiting switched from Upstash Redis to `express-rate-limit` (in-memory), matching the MVP's single-instance Railway deployment. Removed `@upstash/redis` and `@upstash/ratelimit` dependencies and the corresponding env vars.

### Added
- Frontend shell: shadcn-style UI primitives (Button, Input, Card, Skeleton, Dialog, Toast/Toaster), persisted dark/light theme with anti-FOUC init script, mobile-first Navbar/Footer/MobileNav, hero section.
- `InputForm` wired to a real `useInstagramDownloader` state machine (`IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED`) calling the live `POST /api/v1/fetch` endpoint.
- Shared `InstadropErrorCode` contract in `packages/types`; `AppError` class + `errorHandler` update on the API so every error response (Zod validation, domain errors, unexpected failures) includes a machine-readable `code`.

### Known issues
- Live-tested anonymous Instagram scraping tiers (legacy `__a=1` endpoint, plain HTML, `/embed/captioned/`, unauthenticated internal GraphQL) all currently fail — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). `scraperService.extractMedia` implementation is blocked on choosing a real strategy.
