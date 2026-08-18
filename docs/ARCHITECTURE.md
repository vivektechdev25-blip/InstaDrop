# Architecture

## System diagram

```
User / Browser
      |
      v
Frontend — Vercel Edge (Next.js 14, TypeScript, Tailwind + shadcn/ui)
  |-- URL Input Handler       (regex validation, clipboard paste, param cleanup)
  |-- Preview Card            (video player, carousel swiper)
  |-- Binary Download         (Content-Disposition trigger)
  `-- State Management        (IDLE -> VALIDATING -> FETCHING -> SUCCESS/ERROR/RATE_LIMITED)
      |
      v
Backend API — Render (Node.js 20 + Express, Docker)
  |-- Scraper Engine          (multi-tier fallback scrapers)
  |-- Rate Limiter            (express-rate-limit, in-memory, single instance)
  |-- Security Layer          (Helmet, Zod validation, CORS)
  `-- API Routes              (/api/v1/fetch, /api/v1/download)
      |
      v
Data & Infra Layer
  |-- Supabase PostgreSQL     (request_logs — no PII, hashed IPs only)
  `-- Vercel Edge Cache       (s-maxage=3600, stale-while-revalidate=59)
      |
      v
Instagram CDN (external — scraped via proxy, media never stored on our servers)
```

## Key architectural rule

ReelSaveHub never stores Instagram media on its own servers. All media is proxy-streamed directly to the user's browser.

## Folder structure

```
reelsavehub-monorepo/
|-- apps/
|   |-- web/     Next.js frontend (App Router)
|   `-- api/     Express backend microservice (Dockerized)
|-- packages/
|   `-- types/   Shared TypeScript DTOs (frontend + backend)
|-- docs/        This documentation set
|-- scripts/     Build/deploy/dev scripts
`-- config/      Shared configs (eslint, prettier, tsconfig base)
```

**Rule:** Never create "God Components" or "God Functions." One file = one responsibility. All business logic lives in `services/` — controllers stay thin and only orchestrate.

## Branding: single source of truth (`siteConfig.ts`)

`apps/web/src/lib/siteConfig.ts` owns every piece of branding text that appears in more than one place — `name`, `title`, `description`, `tagline`, and `url`. A rename or tagline change should be a one-line edit here, not a find-and-replace. Audited and centralized 2026-08-05; before that pass, the name was hardcoded in seven separate places.

**Consumers (all read from `siteConfig`, none hold a literal):**

```
siteConfig.ts
  |-- app/layout.tsx            title/description, OG + Twitter tags,
  |                              appleWebApp.title, WebApplication JSON-LD
  |-- app/manifest.ts           name / short_name / description
  |-- app/opengraph-image.tsx   rendered name + tagline
  |-- app/robots.ts             sitemap URL
  |-- app/sitemap.ts            all route URLs
  |-- app/(legal)/*/page.tsx    each page's metadata.description
  |-- components/layout/Navbar.tsx    wordmark
  |-- components/layout/Footer.tsx    wordmark + copyright line
  |-- components/pwa/InstallModal.tsx dialog title
  `-- components/marketing/FeatureList.tsx  "Why {name}" heading
```

**Explicitly not derived from the domain.** A custom domain and a brand name are independent things; nothing inspects `window.location.hostname` to guess the display name. `siteConfig.url` reads `NEXT_PUBLIC_SITE_URL` (env), while the name/tagline are plain config values — changing one never implicitly changes the other.

**Two deliberate exceptions, both documented in-code:**
1. **The hero `<h1>`** (`DownloaderPage.tsx`) duplicates `siteConfig.tagline`'s wording as hand-written JSX, because it highlights "original quality" in its own gradient `<span>` — a single plain string can't express that. The comment there flags that the two must be updated together.
2. **Legal-page prose and FAQ copy** keep `ReelSaveHub` as literal text (~30 mentions across `terms`, `privacy-policy`, `faqData.ts`). Interpolating a config value into every sentence of a legal document makes the source materially harder to read for little real benefit — a genuine rebrand needs a human/legal re-read of that prose regardless. Only the *structural* label-level text (page `metadata.description`, headings, wordmarks) is centralized.

**Manifest note:** `public/manifest.json` (static, fully duplicated name/description) was replaced by `app/manifest.ts` so it could import `siteConfig`. Next.js serves that file convention at **`/manifest.webmanifest`**, not `/manifest.json` — so `layout.tsx`'s `metadata.manifest` and `public/sw.js`'s `APP_SHELL_URLS` both needed updating. The service-worker one was load-bearing: `cache.addAll()` rejects its entire install step if any single precached URL 404s, so a missed reference there would have silently broken offline support. Its `CACHE_NAME` was bumped to `v2` so already-installed workers re-precache rather than retaining the stale list.

## Tech stack

### Frontend
- Next.js 14+ (App Router, Server Actions), TypeScript strict mode
- Tailwind CSS + shadcn/ui (Radix primitives), Framer Motion
- TanStack React Query v5 + Axios

### Backend
- Node.js 20 LTS + Express.js (TypeScript)
- `express-rate-limit` (in-memory) for rate limiting
- Supabase PostgreSQL for audit/anonymous request logs only
- Hosting: Vercel (frontend) + Render (backend API, Dockerized)
- PNPM monorepo workspace

### Rate limiting: in-memory for MVP

`express-rate-limit` runs in-memory, per Render instance, enforcing 10 requests / 10 minutes / IP. This is intentional for the MVP: the backend deploys as a single Render instance, so there is no cross-instance state to synchronize, and it avoids the cost/operational overhead of a Redis dependency (previously Upstash) before it's needed.

**Revisit at scale:** if `apps/api` ever scales to multiple Render instances, in-memory counters no longer share state across instances and the limit becomes effectively `N × 10 req / 10 min / IP`. At that point, switch back to a distributed store (e.g. Upstash Redis with a sliding-window algorithm) so the limit holds across instances. Tracked in [TODO.md](./TODO.md).

### Scraper tiers: instagram-url-direct (fast), Playwright (fallback)

Decision made 2026-08-04, after live-testing showed every anonymous, session-less scraping approach fails against current Instagram (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)):

- **Tier 1 (`apps/api/src/services/scrapers/instagramUrlDirectTier.ts`):** the `instagram-url-direct` npm package, which replays Instagram's internal persisted-query GraphQL call. Fast when it works (sub-second), but the persisted `doc_id` it hardcodes can go stale without warning — live-tested and confirmed to fail this way even against a real, currently-public post.
- **Tier 2 (`apps/api/src/services/scrapers/playwrightTier.ts`):** headless Chromium renders the real post page and reads Instagram's own server-rendered `og:` meta tags (image + caption), plus intercepts the first `video/mp4` network response for video posts. Confirmed live to work where plain HTTP scraping (even with a browser-matching User-Agent) does not — Instagram's bot detection filters on more than the UA string, and a real browser context gets past it.

**Explicitly rejected** (per product decision, not a technical dead end): a paid third-party scraping API (breaks the near-zero-cost MVP budget in [DEPLOYMENT.md](./DEPLOYMENT.md#cost-projections) and sends every submitted URL to a third party) and an own-account session-cookie pool (repurposes the private-account-own-content mechanism in [SECURITY.md](./SECURITY.md) to scrape *other people's* public content at scale — a materially different ToS/ban risk the spec never discussed).

**Latency:** the spec's <800ms extraction target ([PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)) applies only to the Tier 1 success path. Tier 2 launches a real browser and waits for the page to render — confirmed live at ~4-5 seconds per request. This is an accepted tradeoff: reliability over raw speed for the fallback path, since Tier 1 alone is not dependable enough to be the only tier.

## PWA install prompt system

Layered so each piece is independently testable, mirroring the scraper tiers' separation of pure logic from browser/IO concerns. Mounted once, globally, in `apps/web/src/app/providers.tsx` — never inside a page component, so it persists across route changes and isn't duplicated.

```
usePWAInstall()  <-- the only public interface; everything below is an implementation detail
  |-- lib/pwaService.ts            Raw browser API only: beforeinstallprompt/appinstalled
  |                                 listeners, isStandalone() (display-mode: standalone),
  |                                 triggerInstallPrompt(). No React, no storage, no decisions.
  |-- lib/installPromptManager.ts  Pure decision logic, no React, no browser API calls:
  |                                 shouldShowPrompt(), dismissal-cooldown bookkeeping,
  |                                 the 3-dismissal opt-out cap. Testable with plain function
  |                                 calls against a fake storage backend.
  `-- lib/storage.ts               Generic localStorage helper (get/set/remove with optional
                                    TTL). Not PWA-specific - reusable for any future
                                    localStorage need.

components/pwa/
  |-- InstallModal.tsx   The popup. Built on the existing Dialog primitive
  |                      (components/ui/Dialog.tsx) rather than a hand-rolled overlay,
  |                      specifically to inherit its focus trap, aria-modal, and
  |                      Escape-to-dismiss for free.
  `-- InstallButton.tsx  Reusable trigger (renders nothing when there's no captured
                         prompt to trigger) - usable standalone, not just inside the modal.
```

**Data flow:** `beforeinstallprompt` fires -> `pwaService.ts` captures it (via `event.preventDefault()`, deferring Chrome's native mini-infobar) and hands the event to `usePWAInstall` -> the hook asks `installPromptManager.shouldShowPrompt()` whether policy allows showing it right now -> `InstallModal` waits an additional ~2.5s show-delay past eligibility, then opens -> Accept calls `event.prompt()` and persists an "installed" flag; Dismiss ("Maybe Later", Escape, overlay click, or the dialog's own close button all count) records a dismissal and starts a cooldown (3 days or 3 visits, whichever elapses first) before the modal is eligible to reappear, up to a hard cap of 3 dismissals after which the user is treated as permanently opted out.

**Reminder defaults and reasoning:** 3-day / 3-visit cooldown (whichever elapses first) balances not annoying a user who just said no against not permanently losing the chance to convert someone who dismissed out of momentary friction, not disinterest. Max 3 dismissals before permanent opt-out, because past that point repeated prompting reads as nagging rather than a helpful reminder — decided with the user 2026-08-04.

**iOS Safari gap:** Safari never fires `beforeinstallprompt` at all (it has no A2HS API), so `canInstall` is permanently `false` there and the modal never appears — not a bug, a platform limitation. An iOS-specific instructional variant (manual "tap Share, then Add to Home Screen" walkthrough) was considered and explicitly deferred; documented as a known limitation in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

## Direct URL mode: two entry points, one pipeline

Two doorways that skip the homepage's manual paste-and-click, both funneling into the exact same downloader flow — neither gets its own validation, fetch, or preview logic:

```
https://reelsavehub.com/?url=<instagram-url>              (query param - for shared links)
https://reelsavehub.com/<instagram-url>                    (catch-all - address-bar shortcut)
      |                                    |
      v                                    v
extractFromQueryParam()          extractFromCatchAllPath()      lib/urlParser.ts
(reads searchParams.url)         (rejoins params.url[] segments)  - pure extraction
      |                                    |                       only, never
      `-------------------+----------------'                       validates
                           v
              <DownloaderPage initialUrl={...}/>     components/downloader/DownloaderPage.tsx
                           |                          - the ONE page shell (Navbar/hero/Footer)
                           v                            shared by manual, ?url=, and catch-all
              <InputForm initialUrl={...}/>           components/downloader/InputForm.tsx
                           |                          - the ONE orchestration component: owns
                           v                            url state, the hook, and every rendered
              useInstagramDownloader().submit()          state (loading/error/PreviewCard)
                           |                          - initialUrl seeds state + fires one
                           v                            auto-submit effect on mount, going
        VALIDATING -> FETCHING -> SUCCESS|ERROR          through the real state machine, not
                                                          a silent background fetch
```

**Why validation isn't duplicated:** `useInstagramDownloader().submit()` already calls `cleanInstagramUrl()` + `isValidInstagramUrl()` (`lib/validators.ts`) before ever fetching, and already dispatches a friendly `ERROR` state for anything that fails. `urlParser.ts` therefore does zero validation of its own — it only extracts a raw candidate string, decoded defensively so it can't throw. This means garbage input (`reelsavehub.com/some/random/thing`) is handled for free by the existing error path: no new error UI, no unhandled exception, confirmed live.

**A real bug found and fixed while building this:** the naive assumption was that a path like `/https://www.instagram.com/reel/X` splits into catch-all segments preserving the double slash as an empty-string artifact (`["https:", "", "www.instagram.com", ...]`), which a plain `join("/")` would reconstruct correctly. Confirmed live via `curl -I` that this is wrong — Next.js issues a 308 redirect that **collapses consecutive slashes before the catch-all route ever sees them**, so the real segments are `["https:", "www.instagram.com", "reel", "X"]` with the "//" already gone. `extractFromCatchAllPath()` detects a scheme-shaped first segment (`/^https?:$/`) and re-inserts `"//"` explicitly rather than relying on an empty segment that doesn't survive.

**Route precedence (verified, not assumed):** Next.js App Router resolves static routes before the `[...url]` catch-all, so `/privacy-policy`, `/terms`, `/contact`, `/manifest.json`, `/robots.txt`, and `/sitemap.xml` all still resolve to their real handlers — confirmed live with `curl` against a production build after adding the catch-all route, not inferred from documentation.

**Abuse throttle:** both entry points auto-trigger a fetch without a manual click, removing the natural throttle a manual paste provides. Both are marked `noindex` (static metadata on the catch-all route, conditional `generateMetadata` on the homepage when `?url=` is present) so crawlers can't discover and hit an unbounded set of URLs. Both share the exact same backend rate limiter as the manual flow, since both call the identical `apiClient.post("/fetch")` — confirmed live, not assumed: tripped the limiter via direct requests, then confirmed a **fresh** request through each entry point independently returns the same `RATE_LIMITED` UI state, proving there's no separate budget or bypass. See [SECURITY.md](./SECURITY.md#direct-url-mode-auto-fetch-throttling).

## Own-private-content flow (session-cookie authenticated)

A **separate, additive** feature (2026-08-05) from the public flow above — reject-with-`PRIVATE_ACCOUNT` MVP behavior is unchanged. Lets a user download their **own** private Reels/posts using their own Instagram session cookie. Four options were evaluated for private-account support before this project started (Basic Display API — dead; Graph API — Business/Creator only; direct credential collection — rejected on security/legal grounds; **session cookie, own content only — approved**), documented in [SECURITY.md](./SECURITY.md#own-private-content-session-cookie-handling).

```
apps/web/src/app/private/page.tsx          Separate page, own shell - never
  |                                          reachable from the public flow,
  |                                          noindex, not linked in Navbar/Footer
  v
PrivateContentForm.tsx                      Masked cookie input + Reel/post URL
  |                                          input, reuses Input/Button/Card
  v
usePrivateContentFetch.ts                   Parallel state machine (own reducer -
  |                                          SESSION_EXPIRED/ACCESS_DENIED have no
  |                                          equivalent in useInstagramDownloader.ts)
  v
POST /api/v1/private/fetch                  Separate endpoint, NOT a modification
  |                                          of /fetch. Own, stricter rate limiter
  |                                          (3 req/10min vs 10 req/10min)
  v
privateContentService.ts
  1. New Playwright context, sessionid cookie attached before navigation
  2. Navigate to the target URL; page.url() redirected to /accounts/login/
     -> SESSION_EXPIRED (a long-standing, structurally stable Instagram
     redirect convention, chosen deliberately over guessing an embedded-
     JSON key name for "is this session valid")
  3. Extract the authenticated viewer's own identity from the SAME page
     load (deep-search embedded relay data - see below)
  4. Extract the requested content's owner identity, same technique
  5. viewer.id !== owner.id (or owner.id missing/unparseable)
     -> ACCESS_DENIED - fails CLOSED, never proceeds on an unverified
     assumption of ownership
  6. Extract media via the SAME shared helpers Tier 2 uses
     (mediaExtractionHelpers.ts - audio-fix, full-res image, carousel)
  7. context.close() - cookie's lifetime ends here, in-memory only
      |
      v
Same ApiSuccessResponse<InstagramPost> shape as the public flow -> rendered
via the EXISTING PreviewCard/MediaViewer, downloaded via the EXISTING,
UNMODIFIED GET /api/v1/download
```

**Why this isn't a third scraper tier:** `IMediaScraper` (`extract(url: string)`) has no way to express "and verify ownership against this authenticated identity" - bending it to fit would be an awkward, leaky abstraction. `privateContentService.ts` doesn't implement that interface and doesn't go through `scraperService.ts`'s tier-fallback pattern; there's no fallback concept for an authenticated request, just one path that fails closed.

**Why Tier 1 (`instagram-url-direct`) couldn't be adapted:** confirmed at the package-source level (`node_modules/.pnpm/instagram-url-direct@2.0.7/.../instagram.cjs`) that its request path accepts no cookie/session parameter at all — it fetches its own anonymous CSRF token and never attaches a `Cookie` header anywhere. This is a structural fact about the dependency, not a guess. Only the Playwright-based approach (Tier 2's pattern) can carry an authenticated session, since Playwright can attach cookies to a real browser context before navigation.

**Refactor this feature required:** every DOM-parsing helper `playwrightTier.ts` used (`findProgressiveVideoUrl`, `findFullResolutionImage`, `collectCarouselSlides`, etc.) was module-private, not reusable elsewhere. Extracted into `mediaExtractionHelpers.ts` as a pure refactor (no behavior change, confirmed via a live regression fetch against a real reel before and after) so both the public Tier 2 and this authenticated flow share the exact same extraction logic rather than duplicating it.

### Scope: Reels + Posts only, no Stories

Investigated before building, not assumed: Reels/Posts have a stable, user-copyable permalink (`/reel/{shortcode}/`, `/p/{shortcode}/`) that fits the existing paste-a-link UX. Stories have no equivalent — they're conventionally accessed by tapping through a story tray, keyed internally by user ID + ephemeral media ID, not a link a typical user would know how to copy. A real Stories feature would need a genuinely different "browse your current active stories, pick one" UI, not this form. **Explicitly deferred** (decision confirmed 2026-08-05) rather than force-fit into the link-paste pattern — a separate, future feature if built at all.

### What's confirmed live vs. genuinely unverified

Confirmed live: request validation (both fields), the separate stricter rate limiter tripping independently of the public endpoint's budget, and that a validation failure never echoes the submitted cookie value back (Zod's `flatten().fieldErrors` contains only message strings). The refactor into `mediaExtractionHelpers.ts` was regression-tested against a real reel fetch before and after, confirming zero behavior change to the public flow. **Also now confirmed live:** the `/accounts/login/` redirect-on-expiry check itself — a well-formed-but-fake `sessionCookie` sent against a real reel URL returned a genuine `401 SESSION_EXPIRED`, proving Instagram really does redirect an invalid session to the login page and that the app correctly detects it, not just that the code compiles.

**Genuinely unverified — flagged honestly, not glossed over:** the actual authenticated happy path, and — most importantly — the two identity-extraction functions (`findViewerIdentity`, `findContentOwner` in `privateContentService.ts`), which only ever run once past the login-redirect check (i.e. only with a real, currently-valid session). Both deep-search Instagram's embedded relay data for plausible key names (`viewer`/`logged_in_user`/`current_user` for the authenticated user; `owner.id` for content, extending the already-confirmed-live pattern that `owner.username`/`is_private` exist on the same GraphQL shape). Neither specific key name has been confirmed against a real authenticated response, because this project has no way to create or access a real, valid Instagram session in this environment — the same structural limitation as the long-standing private-account-detection gap (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). Both fail closed (treated as `ACCESS_DENIED`) rather than proceeding on an unconfirmed guess if nothing is found. This needs real verification against a real test cookie from an account the user controls before the ownership check can be trusted as correct, not just as safely-fails-closed.

