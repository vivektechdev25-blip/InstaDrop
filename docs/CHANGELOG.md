# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Initial monorepo scaffolding: `apps/web` (Next.js), `apps/api` (Express), `packages/types` (shared DTOs)
- Documentation set under `docs/`
- Root workspace config (`pnpm-workspace.yaml`, shared `tsconfig.base.json`, `.gitignore`)
- Frontend shell: shadcn-style UI primitives (Button, Input, Card, Skeleton, Dialog, Toast/Toaster), persisted dark/light theme with anti-FOUC init script, mobile-first Navbar/Footer/MobileNav, hero section.
- `InputForm` wired to a real `useInstagramDownloader` state machine (`IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED`) calling the live `POST /api/v1/fetch` endpoint.
- Shared `InstadropErrorCode` contract in `packages/types`; `AppError` class + `errorHandler` update on the API so every error response (Zod validation, domain errors, unexpected failures) includes a machine-readable `code`.
- Implemented `scraperService.extractMedia` as a two-tier fallback: `instagram-url-direct` (Tier 1, fast path) then Playwright headless Chromium (Tier 2, fallback). Confirmed live end-to-end against real public posts: image post, video/reel post, and a nonexistent-shortcode `INVALID_URL` case. Private-account detection is implemented but not live-verified (no real private post available to test against).
- `AppError`-based error classification (`PRIVATE_ACCOUNT`, `INVALID_URL`, `SERVER_ERROR`) flows through `scraperService` so a tier that reaches a definitive answer short-circuits further fallback tiers.
- `apps/api/Dockerfile` switched to the official `mcr.microsoft.com/playwright` base image (Chromium + all OS deps preinstalled) since Alpine can't reliably run Chromium; added root `.dockerignore`.
- Implemented `downloadService.streamToResponse` (`GET /api/v1/download`) — proxy-streams the media file directly from the upstream CDN response to the client, setting `Content-Disposition: attachment` plus the correct `Content-Type`/`Content-Length`. Confirmed live end-to-end for both a real image and a real video CDN URL (valid, complete files verified with `file`).
- SSRF guard on the download endpoint: `url` is restricted to `*.cdninstagram.com` / `*.fbcdn.net` hostnames via a Zod refinement, confirmed live to reject other hosts with `400 INVALID_URL`.
- `PreviewCard` + `MediaViewer`: renders the fetched post (video player for reels/videos, prev/next + dot-indicator carousel for multi-slide posts) with a per-slide download button wired to `GET /api/v1/download`. Confirmed live in an actual browser via Playwright-driven screenshots of the running dev app, not just typechecking - real image post and real reel post both render correctly end-to-end from paste to preview.
- SEO: `siteConfig.ts` as the single source of truth for the canonical site URL; root layout metadata expanded with `metadataBase`, canonical link, full OpenGraph/Twitter tags, and `WebApplication` JSON-LD; `robots.ts`/`sitemap.ts` (Next.js file conventions, replacing the static `robots.txt`) and an auto-generated `opengraph-image.tsx`. Confirmed live with a production build (`next build && next start`): `/robots.txt`, `/sitemap.xml`, and `/opengraph-image` (valid 1200x630 PNG) all verified, plus the actual rendered `<head>` checked for canonical/OG/Twitter/JSON-LD tags.
- PWA: hand-rolled service worker (`public/sw.js`, network-first navigations / cache-first assets) registered via `useServiceWorker` (production-only, to avoid fighting dev-mode hot-reload); real 192/512/maskable PNG icons generated to match the brand mark (the manifest previously had `icons: []`, which fails Chrome's installability check). Confirmed live in real Chromium via Playwright: service worker reaches `activated` with zero console errors, the app shell populates the cache, and — going further than "should work" — actually simulated `context.setOffline(true)` and reloaded: the real UI rendered from cache with the network fully off.

### Changed
- Rate limiting switched from Upstash Redis to `express-rate-limit` (in-memory), matching the MVP's single-instance Railway deployment. Removed `@upstash/redis` and `@upstash/ratelimit` dependencies and the corresponding env vars.

### Fixed
- The 429 rate-limit response was missing `code: "RATE_LIMITED"` (the rest of the API always includes a `code`, this handler was written by hand and missed it) — confirmed live by sending 12 rapid requests: the first 10 pass through, requests 11+ return `429` with the standard `RateLimit-*`/`Retry-After` headers and now the correct `code`.
- Instagram post URLs with a username segment (`/{username}/reel/{shortcode}/`) were rejected by the URL validation regex on both frontend and backend — now accepted.
- `page.evaluate()` closures threw `__name is not defined` under `tsx watch` (esbuild helper-injection artifact) — switched to string-based `evaluate()` calls.
- Captured video URLs could point to a tiny partial byte-range chunk instead of the full file (Chromium's video-preload chunking) — now strips the range query params before returning the URL, confirmed to yield the complete file.
- `packages/types` now has a real build step (`tsc` emitting to `dist/`, `main`/`types` pointed there, a `prepare` script builds it automatically on `pnpm install` so local dev keeps working). Getting `apps/api/Dockerfile` to actually build and run with this took four rounds of real `docker build`/`docker run` testing, each surfacing a genuine bug: a missing `pnpm-lock.yaml` copy (pre-existing, not new), the new `prepare` script needing source files not yet present in the deps layer, its `tsconfig.json`'s `extends` target missing too, and the runner stage's flattened `dist/` breaking pnpm's relative workspace symlinks (`Cannot find module 'express'` on container boot). Fully fixed and confirmed: the built container starts, and real requests through it exercise Zod, `@instadrop/types` resolution, and Playwright/Chromium (scraping an actual Instagram URL) successfully. See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for the blow-by-blow.
- Tier 2 (Playwright) image extraction now recovers the real full-resolution image instead of Instagram's cropped `og:image` feed thumbnail, by matching the shared CDN media ID against the post's actual `<img>` element and picking its largest rendition. Confirmed live: recovered 1350x1688 (340KB) from a 640x640 (25KB) crop, verified by downloading the real file and checking its actual pixel dimensions. The originally-proposed fix (capture same-CDN-family responses, keep the largest) turned out to be based on a wrong assumption — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for what was actually true.

### Known issues
- Carousel slide extraction is implemented but not verified against a real multi-slide post, and is now known to rely on a CDN-family match that isn't post-specific — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
- Private-account detection is implemented but not live-verified against a real private post — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
