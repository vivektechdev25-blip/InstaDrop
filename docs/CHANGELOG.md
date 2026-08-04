# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Initial monorepo scaffolding: `apps/web` (Next.js), `apps/api` (Express), `packages/types` (shared DTOs)
- Documentation set under `docs/`
- Root workspace config (`pnpm-workspace.yaml`, shared `tsconfig.base.json`, `.gitignore`)

### Changed
- Rate limiting switched from Upstash Redis to `express-rate-limit` (in-memory), matching the MVP's single-instance Railway deployment. Removed `@upstash/redis` and `@upstash/ratelimit` dependencies and the corresponding env vars.
