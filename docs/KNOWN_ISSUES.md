# Known Issues

## Scraper implementation notes (2026-08-04)

`scraperService.extractMedia` is implemented as a two-tier fallback (`instagram-url-direct` → Playwright) — see [ARCHITECTURE.md](./ARCHITECTURE.md#scraper-tiers-instagram-url-direct-fast-playwright-fallback) for why. Live-testing against real public posts along the way surfaced several non-obvious bugs, all fixed, documented here so the reasoning isn't lost:

| Issue found live | Fix |
|---|---|
| The "easy" anonymous scraping tiers (legacy `?__a=1&__d=dis`, plain page HTML, `/embed/captioned/`, unauthenticated internal GraphQL) all fail against current Instagram — see the table below. | Led to the Tier 1/Tier 2 decision above. |
| `page.evaluate(() => ...)` closures throw `ReferenceError: __name is not defined` at runtime under `tsx watch`. `tsx`'s esbuild transform wraps functions with a `__name` helper that only exists in the Node-side module scope; Playwright stringifies the closure and sends it to the browser, where that helper doesn't exist. | Pass `evaluate()` bodies as strings instead of closures — sidesteps the serialization issue entirely, works the same under `tsx` (dev) and compiled `tsc` output (prod). |
| Instagram post URLs can include a username segment (`/natgeotv/reel/{shortcode}/`), not just the bare `/reel/{shortcode}/` form. The original validation regex only accepted the bare form and rejected real, valid URLs. | Both `apps/api/src/validators/fetchMediaSchema.ts` and `apps/web/src/lib/validators.ts` now accept an optional `/{username}/` prefix. |
| Chromium's video-preload behavior fetches video in byte-range chunks (`bytestart`/`byteend` query params, not a standard HTTP `Range` header) rather than one full-file request. Capturing "the first video/mp4 response" can grab a tiny partial chunk (confirmed: a 247-byte fragment) instead of the full file. | Confirmed live that stripping `bytestart`/`byteend` from *any* captured chunk's URL and re-requesting it makes the CDN serve the complete file (verified via `curl -L`: valid, correctly-sized `.mp4`). `playwrightTier.ts` now does this unconditionally. |
| My initial guess for the "post not found" page copy (`"Sorry, this page isn't available"`) was wrong for this specific route — confirmed by actually navigating to a real nonexistent shortcode. | Corrected to the real, live-observed copy: `"Post isn't available"`. |
| The private-account detection string (`"This Account is Private"`) is **not** live-verified — no real private post could be sourced this session to test against, unlike every other path above. | Checking a couple of plausible phrasings as a hedge, but flagged in code (`playwrightTier.ts`) and here: needs real QA against an actual private post before being trusted. |

### Anonymous scraping tier test results (original investigation)

Live-tested against a confirmed-real, currently public Instagram post before choosing a strategy:

| Tier tested | Result |
|---|---|
| Legacy `GET /p/{shortcode}/?__a=1&__d=dis` JSON endpoint | `404 Page Not Found` — Meta has fully removed this endpoint |
| Plain post page HTML (`GET /p/{shortcode}/`) | `200 OK` but no `og:image`/`og:video`/embedded JSON — served the generic JS app shell, not server-rendered data |
| `GET /p/{shortcode}/embed/captioned/` | Same generic JS app shell as above, no media data |
| Internal GraphQL persisted-query endpoint (`POST /graphql/query`, `doc_id`-based — what `instagram-url-direct` uses) | `200 OK` but GraphQL-level `"execution error"` — the persisted `doc_id` is stale/rotated or the query now requires an authenticated session |

## Carousel support is unverified

`playwrightTier.ts` collects carousel slides by clicking the "Next" control and capturing newly-loaded images from the same CDN path family as the cover image (`t51.XXXXX-15`-style path segment). This mechanism is built on individually-verified primitives, but no real multi-slide (carousel) public post could be sourced this session to test the click-and-capture loop end-to-end. Carousel posts currently fall back to image-only (no video-in-carousel support). **Needs QA against a real carousel post before being trusted.**

## Deployment gap: `packages/types` has no build step

`packages/types/package.json` points `main`/`types` at raw `src/index.ts`. This works during development (Next.js and `tsx` both handle `.ts` imports directly via workspace symlinks), but a compiled production `node dist/app.js` process cannot `require()` a raw `.ts` file. `apps/api`'s Dockerfile will not actually run until `packages/types` gets a real build step (e.g. `tsup`/`tsc` emitting to `dist/`, with `main`/`types` pointed there). Not fixed yet — flagged for the Day 5 deployment work in [TODO.md](./TODO.md).

## Structural limitations to keep in mind

- `apps/api/src/services/downloadService.ts` is still a stub — the binary download endpoint (`GET /api/v1/download`) is not implemented yet.
- Instagram's DOM/API can change without notice — both scraper tiers are inherently fragile to Instagram-side changes; this is exactly why the tier system exists rather than depending on one technique.
