# Testing

Every feature must be manually tested before being considered done. Explicitly cover:

- Edge cases (malformed URLs, non-Instagram URLs, deleted posts)
- Empty states
- Loading states
- Network failures
- Rate-limit states (`RATE_LIMITED`)
- Invalid URLs
- Private account responses (`PRIVATE_ACCOUNT`)

## Automated suite (added 2026-10-14)

Vitest in all three packages, run from the repo root. Every suite is **hermetic**: Playwright, `fetch`, Instagram and the CDN are stubbed, so CI never depends on a third party being up (or on Instagram's current markup).

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint 8.57 everywhere (`next/core-web-vitals` for web; `@typescript-eslint/recommended` for api and types). ESLint 8, not 9: `eslint-config-next@14` doesn't support 9. |
| `pnpm typecheck` | `tsc --noEmit` per package, **including test files** (`tsconfig.typecheck.json` in api/types). |
| `pnpm test` | All Vitest suites. |
| `pnpm build` | `packages/types` → `apps/api` → `apps/web`, in dependency order. |

All four run in CI (`.github/workflows/ci.yml`, Node 20, frozen lockfile), plus a Docker build of the API image.

| Suite | Covers |
|---|---|
| `packages/types/test/dto.test.ts` | Compile-time DTO contract: `ApiResponse` narrowing on `success`, the exact error-code union both apps branch on. Enforced by `pnpm typecheck`. |
| `apps/api/test/mediaExtractionHelpers.test.ts` | `parseOgDescription` (incl. the captionless-post regression), `normalizeDateText`/`extractCoverDate`/`matchesCoverDate` (zero-padding regression), `extractMediaAssetId`, `stripByteRangeParams`. |
| `apps/api/test/validators.test.ts` | Instagram URL validation edge cases, including the invariant that any accepted URL navigates only to Instagram's host; CDN allowlist edge cases (http, apex, lookalikes, trailing dot, IDN, `file:`/`data:`/`javascript:`); a test that fails if the validator and `downloadService` stop sharing one allowlist; session-cookie shape and no-echo. |
| `apps/api/test/env.test.ts` | `PORT`/`CORS_ORIGIN` parsing — every value that used to be accepted and then silently never work. |
| `apps/api/test/browserManager.test.ts` | Crash recovery (disconnect, failed launch, stale disconnect, idempotent close) and the context cap (2 active / 8 queued / 503, cleanup on every path, no deadlock, both flows forced through `withBrowserContext`). |
| `apps/api/test/downloadService.test.ts` | Per-hop redirect validation, hop ceiling and loops, malformed `Location`, header-phase timeout (fake timers) vs. a long body that must not be cut off, client-disconnect cancellation, upstream stream errors, `Content-Disposition`/`Content-Length` handling. |
| `apps/api/test/app.test.ts` | Through `createApp()` with supertest: the three independent rate-limit budgets and their headers, error envelopes (incl. malformed JSON → 400 with the raw body never logged), 413, 404, helmet headers, CORS allow/deny. |
| `apps/api/test/privateContentService.test.ts` | Ownership gate against HTML fixtures (match, mismatch, unknown owner, unknown viewer, login redirect, deleted post) — the service's real in-page detection scripts run in jsdom. Cookie scoping, and redaction from logs even when a library error contains it. No real session is used. |
| `apps/api/test/scraperTiers.test.ts` | Tier cascade semantics, the Tier 1 circuit breaker (trip on 401/403/429, skip, recover after 15 min, log once), no package-level retries, single-video posts still routed to Tier 2. |
| `apps/api/test/shutdown.test.ts` | Graceful shutdown order, and that a hung browser close or open keep-alive connections still exit. |
| `apps/web/src/components/downloader/PreviewCard.test.tsx` | Download success/filenames, HTTP-error envelopes never saved as media, non-JSON error pages, transport-failure fallback, double-click protection, carousel slide naming. |
| `apps/web/src/components/downloader/InputForm.test.tsx` | Validation, URL cleaning, rate-limit and timeout messaging, one toast per failed attempt (regression), in-flight submit guard, auto-submit of an initial URL. |
| `apps/web/src/lib/lib.test.ts` | Request-failure classification, URL cleaning (incl. the non-Instagram-host regression), catch-all/query entry points, download URL builders. |

**Mutation-checked, not just green.** For every fix with a regression test, the fix was temporarily reverted and the suite confirmed to fail, then restored. One honest exception: PreviewCard's in-handler double-click guard can't be observed through the DOM — React re-renders between two discrete clicks, so the `disabled` attribute is what actually blocks the second click (and *that* is caught when removed). The handler guard is defense in depth.

**Not covered by the automated suite** (still manual/live — see the sections below): real Instagram markup, real Chromium rendering, real CDN media (audio track present), Railway/Netlify behavior.

### Opt-in live checks

Not part of `pnpm test`, by design. With the API running locally (`pnpm dev:api`):

```bash
curl -s localhost:4000/health
curl -s -X POST localhost:4000/api/v1/fetch -H 'Content-Type: application/json' \
  -d '{"url":"https://www.instagram.com/reel/<shortcode>/"}'
```

For a reel, download the returned URL through `/api/v1/download` and confirm the file contains both an `avc1` (video) and `mp4a` (audio) track — an HTTP 200 alone has never been enough in this project's history. Keep live checks to a handful of requests: Instagram throttles anonymous traffic (see the Tier 1 entry in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)).

## Earlier manual verification

Before 2026-10-14 everything was verified through live manual/scripted testing against the real running app (curl against the API, Playwright-driven browser checks against dev/production builds, real Docker builds). Those records stay below.

## Lighthouse audit (2026-08-04)

Run against the home page (`/`) on a real production build (`next build && next start`), not dev mode:

| Category | Score |
|---|---|
| Performance | 99 |
| Accessibility | 100 (was 96 — see below) |
| Best Practices | 100 |
| SEO | 100 |

Core Web Vitals: FCP 0.8s, CLS 0, TBT 20ms, Speed Index 0.8s — all comfortably within the NFR targets in [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md). LCP was 2.2s on this run (above the <1.5s target) — investigated in full and resolved as a measurement-methodology issue, not a code defect: under directly-applied (not simulated) equivalent throttling, LCP is 1.475s. See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#lcp-investigation-2026-08-04-resolved-as-a-measurement-methodology-issue-not-a-code-defect) for the three-way comparison that confirms this.

**Accessibility fix:** the first run scored 96, flagging the "Paste from clipboard" button (16×16px, icon-only with no padding) as failing the minimum 24×24px touch target size. Fixed by giving it a proper 36×36px hit area; found the same underlying issue in `PreviewCard`'s carousel dot indicators (6×6px visual dot was also the entire clickable area) and fixed it the same way — a larger invisible touch target around a small visual dot, not verified by this specific Lighthouse run since it only audits what's rendered on initial page load (the carousel only appears after a real multi-slide fetch), but the same class of bug and the same fix pattern. Re-ran Lighthouse after the fix: confirmed 100.

**Also manually checked** (Playwright-driven, real browser, not just the automated audit): keyboard `Tab` order through the home page is logical (logo → nav links → theme toggle → URL input → paste button → footer links), and the disabled "Download" submit button correctly drops out of tab order until the field has a value.

## Carousel extraction (2026-08-04)

Verified live against **9 real, currently-public carousel posts** (sourced via web search, confirmed multi-slide via Playwright before testing) through the actual running API — not a code-review sign-off. All 9 returned the correct slide count, with correct/distinct/full-resolution URLs; downloaded and diffed both slides from one post to confirm they're genuinely different, complete, valid files. Two real bugs were found and fixed in the process (the original click-based mechanism never worked at all, and a date-format mismatch between two of Instagram's own metadata sources silently dropped a real slide) — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#carousel-support-fixed-and-verified-2026-08-04) for the full investigation. Not verified: carousels with 3+ slides or a video slide (no real example of either was found).

## Private-account detection: blocked, not verified (2026-08-04)

Genuinely could not be tested this session — not from lack of trying, but because private posts are by definition not publicly discoverable, so there's no real example to search for, and creating a throwaway Instagram account isn't possible in this environment (requires phone/email verification). Full explanation of what was tried and what's needed to unblock it: [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#private-account-detection-genuinely-blocked-not-just-didnt-get-to-it-2026-08-04).

## Responsive verification (permanent requirement, baseline established 2026-08-04)

Mobile-first (spec Section 17) is now a **verified, not assumed** characteristic — re-run this section (or the relevant subset) whenever layout-affecting UI changes, not just once. Tested via real Playwright browser automation at five breakpoints: 375px (mobile), 430px (mobile large), 768px (tablet), 1024px (laptop), 1440px (desktop).

**Coverage:** home page in `IDLE` state, home page with `MobileNav` open, all three legal pages, home page with a real fetched image `PreviewCard`, home page with a real fetched video `PreviewCard` (video posts loaded once each and the viewport resized through all 5 breakpoints without re-fetching — tests actual CSS reflow, not 5 separate fresh loads), and the client-side invalid-URL error/toast state.

**Checked programmatically, not just eyeballed:** horizontal overflow (`document.documentElement.scrollWidth` vs. `clientWidth`) at every breakpoint for every page/state, and touch-target size (getBoundingClientRect, ≥44×44px per WCAG 2.5.5 / Apple HIG — a stricter bar than Lighthouse's own 24×24px accessibility check) for every interactive element on mobile widths.

**Result:** zero horizontal overflow anywhere, across all pages/states/breakpoints, both before and after the fixes below.

**Two real bugs found via this pass (not caught by Lighthouse, since neither is an overflow or a Lighthouse-style 24px touch-target failure):**

| Bug | Found via | Fix |
|---|---|---|
| `Toast` used a translucent tinted background (`bg-destructive/10`, `bg-success/10`). On the error state at both 375px and 1440px, this let the submit button and footer links visibly bleed through the toast card behind it — read as broken overlapping text, not a floating notification. | Visual screenshot inspection (the automated overflow/touch-target checks don't catch this — it's a stacking/opacity issue, not a size issue) | Switched to an opaque `bg-card` background with a colored border + icon for variant distinction, body text kept neutral for readability. Re-screenshotted at both breakpoints: clean, fully opaque, no bleed-through. |
| 4 elements measured below the 44×44px touch-target minimum on mobile: "Paste from clipboard" button (36×36), theme toggle + mobile-menu hamburger (40×40, from `Button`'s `size="icon"`), and `MobileNav`'s Privacy/Terms/Contact links (327×**24** — no vertical padding at all). All had already passed Lighthouse's own accessibility audit (100/100), since Lighthouse's touch-target check only requires 24×24px. | Programmatic `getBoundingClientRect()` check at 375px/430px | Paste button → 44×44px. `Button`'s `icon` size variant → 44×44px (fixes both the theme toggle and hamburger, and any future usage). `MobileNav` links → added `py-3` (each now comfortably exceeds 44px tall) and a hover state, replacing bare zero-padding text. Also gave the toast's dismiss button an explicit 44×44px hit area (`X` icon it wraps was previously unmeasured/undersized). Re-ran the full check afterward: 17/17 touch targets now pass, 0 failures (was 11/17 failing). |

**Also confirmed:** image and video `PreviewCard`s (including the video player's native controls) reflow correctly at every breakpoint with no distortion or clipping — spot-checked visually at all 5 widths, not just algorithmically.

### Re-run against InstallModal (2026-08-04)

Per the standing rule above ("re-run whenever layout-affecting UI changes"), re-ran the same 5-breakpoint methodology specifically against the new `InstallModal` after building it and fixing the two bugs described in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#pwa-install-prompt-system-2026-08-04). Opened via a synthetic `beforeinstallprompt` event at each breakpoint (375/430/768/1024/1440px), waited past the 2.5s show delay, then checked overflow, dialog clipping against the viewport, and touch-target size on every button inside the dialog.

**Result:** 0 overflow issues, 0 clipping issues, 15/15 touch targets (3 buttons × 5 breakpoints) pass ≥44×44px. Screenshots taken at every breakpoint and visually spot-checked — modal stays centered and fully within viewport at all 5 widths, buttons stack full-width below `sm:` and sit side-by-side above it, no distortion.

## Known test gaps

- Private-account detection is implemented but not live-verified — blocked, see above.
- Carousel posts with 3+ slides or a video slide within a carousel are unverified (no real example found).
- No automated regression suite — every verification described in [CHANGELOG.md](./CHANGELOG.md) was a one-off manual/scripted check, not something that re-runs on future changes.
