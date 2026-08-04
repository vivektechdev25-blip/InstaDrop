# Known Issues

No known issues yet — implementation has not started beyond scaffolding.

## Structural limitations to keep in mind

- `apps/api/src/services/scraperService.ts` and `downloadService.ts` are stubs that throw `Not implemented yet.` until Day 2 work lands.
- `apps/web/src/hooks/useInstagramDownloader.ts` is a stub for the same reason.
- Instagram's DOM/API can change without notice — the multi-tier fallback scraper pipeline (see [ARCHITECTURE.md](./ARCHITECTURE.md)) exists specifically to absorb this risk, but no scraper tiers are implemented yet.
