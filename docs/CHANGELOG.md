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

### Added
- Implemented `scraperService.extractMedia` as a two-tier fallback: `instagram-url-direct` (Tier 1, fast path) then Playwright headless Chromium (Tier 2, fallback). Confirmed live end-to-end against real public posts: image post, video/reel post, and a nonexistent-shortcode `INVALID_URL` case. Private-account detection is implemented but not live-verified (no real private post available to test against).
- `AppError`-based error classification (`PRIVATE_ACCOUNT`, `INVALID_URL`, `SERVER_ERROR`) flows through `scraperService` so a tier that reaches a definitive answer short-circuits further fallback tiers.
- `apps/api/Dockerfile` switched to the official `mcr.microsoft.com/playwright` base image (Chromium + all OS deps preinstalled) since Alpine can't reliably run Chromium; added root `.dockerignore`.

### Fixed
- Instagram post URLs with a username segment (`/{username}/reel/{shortcode}/`) were rejected by the URL validation regex on both frontend and backend — now accepted.
- `page.evaluate()` closures threw `__name is not defined` under `tsx watch` (esbuild helper-injection artifact) — switched to string-based `evaluate()` calls.
- Captured video URLs could point to a tiny partial byte-range chunk instead of the full file (Chromium's video-preload chunking) — now strips the range query params before returning the URL, confirmed to yield the complete file.

### Known issues
- Carousel slide extraction is implemented but not verified against a real multi-slide post — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
- `packages/types` has no build step, so the API Dockerfile won't actually run yet in production — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
