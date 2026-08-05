# Known Issues

## Quality selector (2026-08-05): investigated, not built - no real substance for videos

Proposed feature: let the user pick a resolution/quality before downloading. Investigated first, per the project's own rule against fabricating options that don't correspond to a real distinct source URL, rather than building UI speculatively.

**Finding:** Instagram's `video_versions` array (the same progressive/muxed data source used to fix the audio bug above) has 3 entries per post, which looked promising - but downloading and `ffprobe`-ing all 3 for **2 different real reels** showed they're byte-identical duplicates (same URL, same resolution, same file size), not distinct qualities. Only **one real, genuinely downloadable quality exists per video** through this data source.

Real multi-resolution data does exist elsewhere - the page also advertises `number_of_qualities: 7` alongside a full DASH manifest - but those representations are fragmented and video-only (the same DASH stream shape that caused the missing-audio bug). Offering them as pickable "quality" options would reintroduce that exact bug for every option except real server-side muxing (`ffmpeg`) per quality level, a heavier addition the spec explicitly gated behind confirming it's genuinely necessary first.

**Decision (confirmed with the user, 2026-08-05):** don't build a quality selector for video posts - there's nothing real to choose between without adding `ffmpeg` muxing infrastructure for a feature whose actual payoff (per-post) is one real file either way. No `QualitySelector` component was built; `InstagramPost`/`MediaItem` in `packages/types` was not extended with a variants field, since it would have nothing genuine to carry for videos. Revisit only if a post type or Instagram response shape is found with genuinely distinct downloadable quality URLs - images and single-photo posts were not separately investigated here since they were never in scope for "quality" in the way video bitrate/resolution is.

## Downloaded videos had no audio (2026-08-05): fixed

**Reported:** a real downloaded reel played back with video only, no sound.

**Root cause, confirmed via `ffprobe` on the actual downloaded file, not assumed:** the extracted URL (from both Tier 1's `instagram-url-direct` package and Tier 2's naive "first `video/mp4` network response" capture) is Instagram's DASH-adaptive video representation - `ffprobe` showed exactly one stream, `vp9`, video-only, zero audio streams. Confirmed this is real: even navigating to the actual post in a real Playwright-driven Chromium session and attempting playback only ever produced the same single video-only network request - no separate audio segment request was ever observed.

**Where the real audio lives:** Instagram separately embeds a pre-muxed "progressive" rendition inside one of the page's server-rendered `<script type="application/json" data-sjs>` relay-data blobs - present even for logged-out visitors, under a component named `PolarisPostVideoPlayerLoggedOutSurface.react`, despite no `<video>` element ever actually mounting into the DOM for an anonymous session (0 `<video>` tags found live). That blob carries `"has_audio":true` and a `video_versions` array. Downloaded and `ffprobe`'d directly from Instagram's CDN: h264 video + AAC audio (44.1kHz stereo), confirmed live against **2 independent real reels**.

**Fix:**
- `playwrightTier.ts` gained `findProgressiveVideoUrl()` - deep-searches every `data-sjs` script tag's parsed JSON for a `video_versions` array (not a fixed path, since Instagram's internal component nesting isn't a stable contract) and prefers that URL over the old DASH-only capture, which is now only a fallback.
- `instagramUrlDirectTier.ts` (Tier 1) has no access to this data at all - its GraphQL query (a fixed, persisted `doc_id`) only ever returns the `video_url` field, which is the same video-only DASH representation. There's no additional field to request instead. So a single (non-carousel) video post now intentionally throws a plain `Error` to force fallback to Tier 2, rather than silently returning a file with no sound. Carousels are untouched - video slides within a carousel are a separate, already-documented gap in both tiers (see below), not something this fix is scoped to touch.

**Verified, not just "should work":** fetched 2 real reels through the actual running API end-to-end (`POST /api/v1/fetch` → `GET /api/v1/download`), `ffprobe`'d the real downloaded bytes for both: `video=true, audio=true` in both, h264+AAC, with **1422 real decoded audio packets** spanning the full clip duration (66.0s audio vs. 65.9s video) - a genuine, full-length synced track, not an empty declared one. `Content-Length` matched actual received bytes exactly in every test. Re-ran an existing real image-carousel post afterward to confirm no regression: still 2/2 images, still resolved via Tier 1 with no fallback needed (the video-only check only applies when `media_details.length === 1 && type === "video"`).

**Not fabricated as fully resolved:** literal playback-with-sound could not be listened to in this sandboxed environment; packet-level `ffprobe` evidence (real, non-empty audio stream synced to the video's duration) is the strongest verification available here.

## Files downloaded from Instadrop failed on WhatsApp share ("Download failed"): fixed, same root cause as above

**Reported:** a file downloaded from Instadrop failed with a generic WhatsApp error ("Download failed. The download was unable to complete.") when shared to another device.

**Ruled out first, not assumed innocent:**
- **Proxy/header corruption:** checked `Content-Length` against actual bytes received through `GET /api/v1/download` - matched exactly, every time, both before and after the fix. `downloadService.ts` sets `Content-Type` directly from Instagram's own upstream response header (not hardcoded/guessed), and pipes the stream with no transformation in between. No truncation or mismatch found anywhere in the proxy path.
- **`moov` atom placement (a common "corrupt file" cause on strict mobile receivers when it sits after `mdat`, forcing a full download before any player can read the file header):** checked byte offsets directly in both the old and new files - `moov` comes before `mdat` in both. Not the cause.

**Most likely actual cause, given the codec evidence found while fixing the audio bug above:** the old video-only file was VP9 inside an `.mp4`/MOV container - a combination with meaningfully weaker support across mobile OS media frameworks than H.264+AAC (VP9 is primarily a WebM/YouTube codec; H.264+AAC-in-MP4 is the universal baseline essentially every platform, including WhatsApp's, is built to expect). The same fix that restores audio (see above) also switches the codec to H.264+AAC.

**Real automated proxy for a strict receiver, since actual WhatsApp isn't available in this environment:** queried Windows' own Shell media-property extraction (`Shell.Application` COM, backed by the same class of OS-level codec plumbing many mobile apps rely on) for both files. The new H.264+AAC file's audio bit rate was recognized as a valid property; the old VP9-only file exposed no audio-related property at all. A real, measurable difference in how a generic OS media pipeline parses the two files - not proof WhatsApp specifically would reject the old one, but consistent with it.

**Not independently confirmed via an actual WhatsApp share** - flagged honestly rather than claimed fixed outright, matching the standard set for the [PWA install prompt's real-browser check](#pwa-install-prompt-system-2026-08-04): this needs a real device/WhatsApp session to fully close out. If the same failure recurs after this fix on a real share, that would mean the codec theory was incomplete and needs revisiting with new evidence.

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

## PWA install prompt system (2026-08-04)

### iOS Safari: no instructional fallback (deferred, known limitation)

Safari (iOS and iPadOS) never fires `beforeinstallprompt` — it has no equivalent API — so `usePWAInstall().canInstall` is permanently `false` there and `InstallModal` never appears for those users. An iOS-specific instructional variant (a manual walkthrough: "tap Share, then Add to Home Screen") was proposed and **explicitly deferred** by the user on 2026-08-04, in favor of shipping the standard-API path first. iOS users can still install manually via Safari's native Share menu; the app just doesn't prompt them to. Revisit if iOS install rate matters enough to justify the extra UI.

### Two real bugs found and fixed while building `InstallModal`

Found via live Playwright checks (`getAttribute`, `getComputedStyle`, `getBoundingClientRect`), not code review:

| Bug found live | Fix |
|---|---|
| `[role="dialog"]` had no `aria-modal` attribute (`getAttribute('aria-modal')` returned `null`) despite Radix trapping focus correctly. This version of `@radix-ui/react-dialog` sets `role`, `aria-labelledby`, `aria-describedby` automatically, but not `aria-modal` — the two are related but distinct signals, and screen readers rely on `aria-modal` specifically to treat outside content as inert. | Added `aria-modal="true"` explicitly to `DialogContent` in `apps/web/src/components/ui/Dialog.tsx`. Re-verified: now returns `"true"`. |
| `InstallModal`'s two action buttons measured ~20px tall despite having Tailwind's `h-11` (44px) class applied. Root cause via `getComputedStyle()`: both buttons had `flex-1` (`flex: 1 1 0%`) inside a `flex flex-col` (column-direction) parent. In a column flex container, `flex-basis` governs main-axis (vertical) sizing and overrides an explicit `height` class — a genuine CSS flexbox spec behavior, not a framework bug. Only manifested in the base/mobile layout, before the `sm:flex-row` breakpoint switches the main axis to horizontal. | Changed both buttons to `w-full sm:flex-1` in `InstallModal.tsx` — full width at the column/mobile layout, `flex-1` only applies once `sm:flex-row` makes it affect width instead of height. Re-verified: both buttons now measure 44px tall at all 5 responsive breakpoints. |
| Dialog's close button (`DialogPrimitive.Close`) measured 16×16px — unsized, below the WCAG 2.5.5 / Apple HIG 44×44px minimum (same class of bug as the [responsive baseline touch-target findings](#responsive-baseline-two-bugs-found-and-fixed-2026-08-04) below). | Added `flex h-11 w-11 items-center justify-center` to `DialogPrimitive.Close` in `Dialog.tsx`, repositioned `right-4 top-4` → `right-2 top-2` to keep it visually balanced at the larger hit area. Re-verified: 44×44px. |

All three re-verified together via a full rebuild + fresh Playwright behavioral suite (install/dismiss/escape/dismissal-cap flows) and a dedicated touch-target check — all pass, and confirmed clean at all 5 responsive breakpoints (375/430/768/1024/1440px): zero overflow, zero clipping, 15/15 touch targets ≥44×44px.

### Real-browser `beforeinstallprompt` confirmation: pending, manual, not fabricated

Everything above was verified with a **synthetic** `beforeinstallprompt` event dispatched via Playwright (`page.addInitScript`) — this proves the app's own logic (capture, decision-making, modal, storage, accessibility) is correct, but it does not prove Chrome's real install-eligibility heuristics actually fire the event against this app in a live browser session. That confirmation requires a real, non-headless Chrome session and is a manual step by design (per user decision 2026-08-04) — it cannot be verified in headless automation, and no attempt was made to fabricate this result. See [SEO.md](./SEO.md#pwa) for the related, previously-flagged gap on the base install-eligibility criteria (manifest/service-worker/HTTPS), which this inherits.

## Local dev server exit 2026-08-05: root cause confirmed, not an app bug

Both local dev processes (`apps/web` on port 3000, `apps/api` on port 4000) were found down mid-session and had to be restarted. Investigated with the same standard as any other unverified claim in this project — checked logs before guessing, then found direct corroborating system evidence rather than settling for "restarting it fixed it."

**What the logs showed:** both processes' stdout/stderr logs stop cleanly after normal, successful operation — no stack trace, no unhandled exception, no `OutOfMemory`, no non-zero exit message, nothing. `apps/web`'s log stopped at 00:08:56, `apps/api`'s at 00:10:23 (2026-08-05, IST) — both within about 90 seconds of each other. A silent, simultaneous stop across two independent Node processes with zero application-level error output is not the signature of a code bug in either app; it's the signature of something external terminating both at once.

**Root cause, confirmed via Windows Event Viewer (`Microsoft-Windows-Kernel-Power`), not inferred:**

| Time (2026-08-05) | Event |
|---|---|
| 00:08–00:10 | Last log output from both dev servers |
| 00:25:46 | System enters sleep (Event ID 42, "Sleep Reason: Application API") |
| 11:30:16 | System exits Modern Standby (Event ID 507, "Reason: Power Button") |
| 11:33 | Servers found down, restarted |

The machine went to sleep ~15–20 minutes after the servers were last active and stayed suspended for roughly 11 hours before being woken by the power button — exactly matching the gap between the two sets of server logs. Windows Modern Standby routinely suspends or network-disconnects background console-attached processes (these were started as plain background shell jobs, not registered Windows services), so the dev servers not surviving that cycle is expected laptop behavior, not an application defect.

**Explicitly ruled out, not just assumed clean:**
- **The new `[...url]` catch-all route throwing an unhandled exception:** checked `extractFromCatchAllPath()` and its callers — decoding is wrapped in try/catch, and the garbage-path test (`instadrop.com/some/random/thing`) was re-confirmed live to return a clean `200` with the existing friendly error UI, not a crash. Also, an exception here would only affect `apps/web`, not explain `apps/api` stopping within 90 seconds of it.
- **A Playwright resource leak from the Tier 2 scraper:** `browserManager.ts` uses a lazily-created singleton `Browser` (never spawns a duplicate instance per request), and `playwrightTier.ts` closes its per-request `context` unconditionally in a `finally` block, including on every error path. A leak here would also manifest as gradual `apps/api`-only degradation, not a synchronized silent stop of both processes.
- **Correlation with the rate-limiter or garbage-path stress testing from the Direct URL Mode work:** all of that testing completed with clean, expected output well before the logged sleep event at 00:25:46 — the timeline doesn't overlap.

**Not something to "fix":** this is a local-dev-only artifact of running background processes on a laptop that sleeps, not a defect in Instadrop's code. **Production monitoring note:** the deployed target (Railway, see [DEPLOYMENT.md](./DEPLOYMENT.md)) is a managed container platform, not a laptop subject to OS sleep — this specific mechanism doesn't apply there. Regardless, once deployed, uptime/process-restart monitoring should be in place so that any *real* production crash (unlike this one) surfaces immediately rather than silently, since a production outage is far more costly than a paused local session.

## Structural limitations to keep in mind

- Instagram's DOM/API can change without notice — both scraper tiers are inherently fragile to Instagram-side changes; this is exactly why the tier system exists rather than depending on one technique.
