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
| The private-account detection string (`"This Account is Private"`) is **implemented, not yet live-verified — confirmed non-blocking, not a launch gate** (see the dedicated section below). | Checking a couple of plausible phrasings as a hedge, flagged in code (`playwrightTier.ts`) and here. Low risk either way: worst case if the marker string doesn't match a real private-account page, the request doesn't return private content or wrong data — it just falls through to a generic `SERVER_ERROR` instead of the friendlier `PRIVATE_ACCOUNT` message (based on reading the code's logic, not live-confirmed for this specific case). Revisit when real test data becomes available. |

### Anonymous scraping tier test results (original investigation)

Live-tested against a confirmed-real, currently public Instagram post before choosing a strategy:

| Tier tested | Result |
|---|---|
| Legacy `GET /p/{shortcode}/?__a=1&__d=dis` JSON endpoint | `404 Page Not Found` — Meta has fully removed this endpoint |
| Plain post page HTML (`GET /p/{shortcode}/`) | `200 OK` but no `og:image`/`og:video`/embedded JSON — served the generic JS app shell, not server-rendered data |
| `GET /p/{shortcode}/embed/captioned/` | Same generic JS app shell as above, no media data |
| Internal GraphQL persisted-query endpoint (`POST /graphql/query`, `doc_id`-based — what `instagram-url-direct` uses) | `200 OK` but GraphQL-level `"execution error"` — the persisted `doc_id` is stale/rotated or the query now requires an authenticated session |

## Carousel support: fixed and verified 2026-08-04

Was unverified (no real carousel post available to test against), and the original mechanism (click "Next", capture newly-loaded images matching the cover's CDN path family) turned out to be fundamentally broken once real test data was found: it returned exactly **1 slide** for a confirmed real multi-slide post, every time.

**Sourcing real test data:** found a public article specifically about viral Instagram carousels (via web search) with 27 embedded post URLs. Batch-checked each with Playwright for the presence of a "Next" carousel control — 9 confirmed real, currently-public, multi-slide carousel posts from 9 different accounts.

**Root cause of the original break, found via live debugging (not guessed):**
1. Playwright's `nextButton.click()` timed out after 30s — Chrome's actionability check reported "subtree intercepts pointer events." Traced the intercepting element: Instagram's own anonymous-visitor signup nudge dialog (`role="dialog"`, "Sign up for Instagram to stay in the loop.") sits on top of the Next button.
2. Even with the click forced through (`{ force: true }`), **no new network request fired and no new image appeared in the DOM.** Traced this too: Instagram preloads carousel slide `<img>` elements directly into the DOM (a sliding window of ~2 slides around the current one) as part of the initial page render — there's nothing new to request when advancing within that window. The entire "click and capture the network response" premise was solving a problem that doesn't exist for this UI.

**Actual fix — two parts:**
1. **Read, don't click.** `collectCarouselSlides()` now reads whatever `<img alt="Photo by ...">` / `<img alt="Video by ...">` elements are already in the DOM, rather than waiting for a click to reveal anything.
2. **Scope to this post only.** Those elements aren't unique to the current post — Instagram also renders "more posts from this account" thumbnails elsewhere on the page with the identical `alt` pattern (confirmed live: e.g. a 2025 post's cover sat alongside 9 unrelated thumbnails from mid-2026, all matching `/^Photo by /`). Real slides are told apart by matching the post's own date (extracted from `og:description`) against the date in each candidate's `alt` text.
3. A click-and-reread loop (`force: true`, since the signup dialog blocks a normal click) still runs afterward in case a sliding preload window reveals more slides beyond the initial ~2 — implemented as a reasonable extrapolation from confirmed behavior, but genuinely unverified beyond 2 slides, since **all 9 real carousels found this session happened to have exactly 2 slides.** No 3+-slide example was available to test whether clicking actually advances the preload window or whether the loop just harmlessly exits (which is what happens for these 9).

**A second real bug found while verifying the fix:** the first re-test (a different carousel post) still returned only 1 slide. Traced it: `og:description` said "August **9**, 2025" (no leading zero) while the matching `<img alt>` said "August **09**, 2025" (zero-padded) — a genuine formatting inconsistency between two of Instagram's own metadata sources for the same post. An exact substring match silently dropped the real second slide. Fixed with date normalization (strip a single leading zero, compare normalized) instead of raw substring matching.

**Verified, all 9 real posts, after both fixes:** every one now returns exactly 2 media items — matching independently-confirmed DOM inspection counts — with correct, distinct, full-resolution URLs. Downloaded both slides from one post through the real `GET /api/v1/download` endpoint: two valid, complete, differently-hashed 1440×1920 JPEGs (not the same file twice, not corrupted). Single-image and video posts re-verified with zero regressions.

**Still not verified:** carousels with 3+ slides (none found this session — see above), and carousels containing a video slide (Instagram's own default-shown JS example was image-only; the extraction only reads `<img>` elements, so a video slide within a carousel would currently be skipped rather than captured).

## Tier 2 (Playwright) image quality gap: fixed 2026-08-04

Was: for image posts served through the Playwright fallback tier, `og:image`'s URL carries a crop instruction in its query string (e.g. `stp=c270.0.810.810a_dst-jpg_e35_s640x640...`) — Instagram's own square feed-thumbnail rendition, not the original. Confirmed live via a browser screenshot of the rendered `PreviewCard` before investigating further.

The originally-proposed fix in this doc ("capture same-CDN-family image responses during page load, keep the largest") turned out to be **wrong** — live-tested and found that same-family responses are unrelated posts' thumbnails (sidebar "more like this" content), not different resolutions of the same photo (see the carousel risk above — same underlying flaw).

**Actual fix:** the real full-resolution image already exists in the rendered page as a normal `<img>` element (Instagram's own accessible `alt="Photo by X on DATE."` image), sharing the same CDN *media ID* (not path family) as `og:image` — the numeric `{assetId}_{containerId}` prefix in the filename. `findFullResolutionImage()` in `playwrightTier.ts` matches on that ID and picks the largest (`naturalWidth × naturalHeight`) matching `<img>` element. Confirmed live end-to-end: recovered a 1350×1688 (340KB) original from what was a 640×640 (25KB) cropped thumbnail, verified by downloading the actual file through `GET /api/v1/download` and checking its real pixel dimensions.

Falls back to `og:image` when no DOM match is found — the expected case for video posts, where the real deliverable is the captured video file and the thumbnail is secondary.

## Deployment gap: `packages/types` build step — fixed 2026-08-04

Was: `packages/types/package.json` pointed `main`/`types` at raw `src/index.ts`, which worked in dev (Next.js and `tsx` both handle `.ts` imports directly via workspace symlinks) but a compiled production `node dist/app.js` process cannot `require()` a raw `.ts` file.

**Fix:** `packages/types` now builds with `tsc` to `dist/` (`main`/`types` point there), with a `prepare` script so `pnpm install` builds it automatically — local dev keeps working without an extra manual step.

Getting the Dockerfile to actually build and run with this took four rounds of live `docker build`/`docker run` testing, each surfacing a real bug that pure code review wouldn't have caught:

| Bug found live | Fix |
|---|---|
| `deps` stage never copied `pnpm-lock.yaml` at all — `pnpm install --frozen-lockfile` failed immediately with `ERR_PNPM_NO_LOCKFILE`. Pre-existing since the original scaffold, not something introduced by this change. | Added `pnpm-lock.yaml` to the `deps` stage's initial `COPY`. |
| The new `packages/types` `prepare` script runs `tsc` during `pnpm install`, but the `deps` stage only ever copied `package.json` files (intentional Docker layer-caching pattern) — no `tsconfig.json`/`src/` present, so `tsc` failed with `TS5058: path does not exist`. | Copy the *whole* `packages/types` directory into the `deps` stage instead of just its `package.json`. |
| `packages/types/tsconfig.json` extends `../../config/tsconfig.base.json`, which also wasn't in the `deps` stage yet — `tsc` failed with `TS5083: Cannot read file`. | Also `COPY config ./config` into the `deps` stage before `pnpm install` runs. |
| Runner stage flattened `apps/api/dist` to `/app/dist` and only copied root `/app/node_modules`. But pnpm gives each workspace package its own `node_modules` full of **relative** symlinks into the shared `.pnpm` store (e.g. `apps/api/node_modules/express -> ../../../node_modules/.pnpm/express@.../...`) — flattening broke that relative path, so the container crashed on boot with `Error: Cannot find module 'express'`. | Preserve the real monorepo path depth in the runner stage: copy to `/app/apps/api/dist`, copy `/app/apps/api/node_modules` (the symlinks) *and* `/app/node_modules` (the actual store) both, `WORKDIR /app/apps/api`, run `node dist/app.js` from there. |

**Verified, not just "builds without error":** after the fourth fix, ran the actual container (`docker run`) and sent real HTTP requests through it — Zod validation, `@instadrop/types` workspace resolution, and Playwright/Chromium launching and scraping a real Instagram URL from inside the container all confirmed working end-to-end.

## LCP investigation 2026-08-04: resolved as a measurement-methodology issue, not a code defect

The previous audit flagged LCP at 2.2s against the spec's <1.5s target. Investigated properly this time — pulled the actual LCP breakdown from a fresh Lighthouse trace rather than guessing:

**LCP element identified:** the `<h1>` hero heading ("Download Instagram photos, reels & videos in original quality") — text, not an image. Its own breakdown: Time to First Byte 143.9ms + Element Render Delay 123.9ms ≈ 268ms observed. That's nowhere near 2.2s, which is the first sign the gap isn't a real rendering bottleneck.

**Checked all the usual suspects, all ruled out:**
- Custom web fonts — none. `grep` confirms no `next/font`/`@font-face` anywhere; the app uses the default system font stack, so there's no font-blocking text paint.
- Hero image — none. The LCP element is a text heading, not an image, so `next/image`/`priority` doesn't apply.
- Critical CSS — Next.js already inlines/optimizes this; the 268ms observed breakdown confirms nothing is blocking.
- Third-party scripts — there are none on the home page at all.

**Root cause:** Lighthouse's default CLI mode uses `throttlingMethod: simulate` on a mobile profile (150ms RTT, 562.5ms request latency, 4x CPU slowdown) — a mathematical extrapolation applied after the fact to the trace, not literally-applied throttling. This simulation model is known to overestimate delay on very lean, mostly-static pages like this one. Confirmed by running the identical page under two other real measurement conditions:

| Run | Throttling | LCP | Performance score |
|---|---|---|---|
| Mobile, `simulate` (Lighthouse CLI default) | Simulated (150ms RTT, 4x CPU) | **2.2s** | 99 |
| Mobile, `devtools` (same profile, actually applied) | Real (150ms RTT, 4x CPU) | **1.475s** | 100 |
| Desktop, `simulate` | Simulated (desktop profile) | **0.6s** | 100 |

Under the *same* network/CPU conditions, actually applying the throttling (`devtools` method) instead of mathematically simulating it after the fact gives 1.475s — meeting the <1.5s target. No code was changed, because there was nothing to fix: no blocking font, no unoptimized hero image, no critical-CSS issue, no third-party script. The page is already about as lean as its functionality allows (React hydration + Tailwind + a handful of icons), and both the desktop and directly-throttled-mobile numbers confirm that.

**Recommendation:** treat 1.475s (`devtools`, real throttling) as the representative number for this page rather than 2.2s (`simulate`, Lighthouse CLI's default). If a stricter reading of the target is wanted, revise it to "<1.5s under directly-applied mobile throttling equivalent to Lighthouse's default profile" rather than chasing Lighthouse CLI's `simulate` mode number specifically, since that mode's own model — not the page — is what's adding the extra ~700ms here.

## Private-account detection: unverified, confirmed non-blocking (2026-08-04)

**Decision (2026-08-04):** confirmed with the user that this stays documented as unverified rather than launch-blocking. Rationale: private accounts are rejected either way (worst case, an unrecognized private page falls through to a generic `SERVER_ERROR` instead of the specific `PRIVATE_ACCOUNT` message — no content leaks, no wrong data returned). Revisit only when a real private test URL becomes available; not gating deployment on it.

Unlike carousel support above, this one could not be resolved this session — explaining why in full, since "not live-tested" alone doesn't distinguish "ran out of time" from "structurally can't be done here."

**Why this is different from carousel test data:** carousel posts are public, so a real example was findable via search (see above). Private posts are, by definition, not publicly indexed — no search engine crawls or lists them, so "search harder" cannot produce a real private post URL. This isn't a gap in effort; it's what "private" means.

**Two genuine attempts made, both dead ends, for the record:**
1. Searched directly for private post URLs / private-account references with post links — nothing, for the structural reason above.
2. Searched for accounts reported as having *recently gone private* (on the theory that an old post URL, referenced in a news article from when the account was still public, might now resolve against a now-private account) — found general articles about Instagram's privacy features and celebrity anecdotes, but no article that happened to include the specific old permalink of an account that's since gone private.

**Creating disposable test data was also considered and ruled out:** a throwaway Instagram account requires phone or email verification during signup, neither of which is available in this environment. Signup itself would also very plausibly hit the same anonymous-bot detection that blocks scraping in the first place (see the anonymous-scraping investigation above) — Instagram's signup flow is a prime target for exactly that kind of defense.

**What would resolve this in the future:** a real Instagram post URL from an account the user owns or controls that is currently set to private. Until then, this stays documented as unverified — confirmed as an acceptable, non-blocking state rather than something to fabricate a test result for.

## Responsive baseline: two bugs found and fixed 2026-08-04

Established a permanent responsive-verification baseline (5 breakpoints, real Playwright screenshots + programmatic overflow/touch-target checks) — full detail in [TESTING.md](./TESTING.md#responsive-verification-permanent-requirement-baseline-established-2026-08-04). Two real bugs surfaced and were fixed, neither caught by the earlier Lighthouse pass:

1. `Toast`'s translucent background let content behind it bleed through, reading as broken overlapping text on the error state at both 375px and 1440px. Fixed with an opaque background.
2. Four elements (paste button, theme toggle, mobile hamburger, `MobileNav` links) measured below the 44×44px WCAG/HIG touch-target minimum — a stricter bar than Lighthouse's own 24×24px check, so passing Lighthouse 100 didn't catch these. All fixed and re-verified (17/17 pass, was 11/17 failing).

Zero horizontal overflow found at any breakpoint, before or after.

## Structural limitations to keep in mind

- Instagram's DOM/API can change without notice — both scraper tiers are inherently fragile to Instagram-side changes; this is exactly why the tier system exists rather than depending on one technique.
