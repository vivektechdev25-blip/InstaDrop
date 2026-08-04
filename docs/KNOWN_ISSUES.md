# Known Issues

## Anonymous Instagram scraping is currently blocked (2026-08-04)

Before implementing `scraperService.extractMedia`, the "easy" anonymous scraping tiers were live-tested against a confirmed-real, currently public Instagram post. All four failed:

| Tier tested | Result |
|---|---|
| Legacy `GET /p/{shortcode}/?__a=1&__d=dis` JSON endpoint | `404 Page Not Found` — Meta has fully removed this endpoint |
| Plain post page HTML (`GET /p/{shortcode}/`) | `200 OK` but no `og:image`/`og:video`/embedded JSON — served the generic JS app shell, not server-rendered data |
| `GET /p/{shortcode}/embed/captioned/` | Same generic JS app shell as above, no media data |
| Internal GraphQL persisted-query endpoint (`POST /graphql/query`, `doc_id`-based — what most unofficial npm scraper packages use, e.g. `instagram-url-direct`) | `200 OK` but GraphQL-level `"execution error"` — the persisted `doc_id` is stale/rotated or the query now requires an authenticated session |

**Conclusion:** naive anonymous HTTP scraping (no session, no headless browser) does not currently work against Instagram from this environment. `scraperService.extractMedia` (`apps/api/src/services/scraperService.ts`) is blocked on choosing a real strategy — see the "Open decision" note in [TODO.md](./TODO.md).

## Structural limitations to keep in mind

- `apps/api/src/services/scraperService.ts` and `downloadService.ts` are stubs that throw `Not implemented yet.` — confirmed live via `curl` to resolve to a `SERVER_ERROR` (500) response through the real `/api/v1/fetch` route.
- Instagram's DOM/API can change without notice — the multi-tier fallback scraper pipeline (see [ARCHITECTURE.md](./ARCHITECTURE.md)) exists specifically to absorb this risk, but which techniques belong in which tier is still an open decision (see above).
