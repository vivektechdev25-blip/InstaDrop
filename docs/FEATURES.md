# Features

## MVP scope (5-day target)

- [x] Single photo/video/reel/carousel URL parsing — confirmed live against real posts, including 9/9 real carousel posts; private-account detection implemented but unverified (confirmed non-blocking), see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [x] Direct CDN link retrieval — `GET /api/v1/download` confirmed live for image, video, and carousel slides, correct headers and complete valid files
- [x] Media preview player — `PreviewCard`/`MediaViewer` (video player, carousel prev/next + dots), confirmed live in a real browser for image, video, and carousel posts
- [x] Responsive dark/light UI — **verified, not assumed**: real screenshots + programmatic overflow/touch-target checks at 5 breakpoints (375/430/768/1024/1440px), see [TESTING.md](./TESTING.md#responsive-verification-permanent-requirement-baseline-established-2026-08-04)
- [ ] Serverless edge API
- [x] Rate limiting (in-memory `express-rate-limit` for MVP — see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp))
- [x] Complete SEO setup — metadata, OG/Twitter, JSON-LD, sitemap, dynamic robots.txt, all confirmed live, see [SEO.md](./SEO.md)
- [x] Direct URL mode — two entry points that skip the manual paste-and-click: `?url=<instagram-url>` (query param, for shared links) and `instadrop.com/<instagram-url>` (address-bar shortcut, catch-all route). Both auto-fill the input and auto-trigger the same fetch flow through the real `VALIDATING → FETCHING → SUCCESS|ERROR|RATE_LIMITED` state machine — no silent background fetch, no duplicated validation or fetch logic. Both `noindex`, and both confirmed live to share the exact same backend rate limiter as the manual flow (no separate budget, no bypass). See [ARCHITECTURE.md](./ARCHITECTURE.md#direct-url-mode-two-entry-points-one-pipeline). **Discoverability (2026-08-05):** the shortcut was built and verified but never surfaced anywhere on the homepage — no user could have discovered it existed. Fixed by adding a 7th `FeatureList` card ("Address-bar shortcut") and a matching `Faq` entry ("Is there a faster way to use Instadrop?"), rather than a dedicated promotional section — kept understated, consistent with the homepage's restrained tone. No changes to `urlParser.ts`, the catch-all route, or `InputForm` — copy only.
- [x] Homepage content depth — `TrustBar`, `HowItWorks` (3-step walkthrough), `FeatureList` (7 genuine, verified capabilities), and an accessible `Faq` accordion (7 entries), plus a restrained radial glow behind the hero. Plain-homepage only — the `?url=`/catch-all utility entry points stay hero+input only, so a shared-link visitor isn't scrolled past marketing copy to reach their result. All copy reviewed and approved before implementation; every feature/FAQ claim maps to something already verified earlier in this project (no fabricated stats). Scroll-triggered fade-in via Framer Motion `whileInView`, confirmed clean at all 5 breakpoints in both themes — re-verified after the 7th card/FAQ entry were added, grid wraps naturally with no forced symmetry, zero overflow. See [SEO.md](./SEO.md#faqpage-structured-data) for the accompanying `FAQPage` schema.

## Progressive Web App

- [x] Installable app shell — manifest with real icons, hand-rolled service worker (network-first navigations, cache-first assets), confirmed live including an actual offline reload test. See [SEO.md](./SEO.md#pwa).
- [x] Install prompt system — `InstallModal` + `InstallButton`, global (not page-scoped), with a ~2.5s show delay, a 3-day/3-visit dismissal cooldown, and a 3-dismissal permanent opt-out cap. Focus-trapped, `aria-modal`, Escape-to-dismiss. Full behavioral suite (show delay, install/dismiss/escape flows, dismissal cap, aria-modal, touch targets) confirmed live via Playwright with a synthetic `beforeinstallprompt` event, and confirmed clean at all 5 responsive breakpoints (375/430/768/1024/1440px) — see [ARCHITECTURE.md](./ARCHITECTURE.md#pwa-install-prompt-system). **Not yet verified:** a real, non-automated Chrome session actually firing `beforeinstallprompt` end-to-end — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). iOS Safari never fires this event at all (documented limitation, no instructional fallback built).
- [ ] `InstallBanner` — lower-priority alternative surface, not yet built (confirmed lowest priority by the user 2026-08-04; build only if time allows).

## Own private content (session-cookie authenticated) — 2026-08-05

- [x] `/private` — a separate, additive page (not linked from `Navbar`/`Footer`, `noindex`) letting a user download their own private Reels/posts using their own Instagram session cookie. Scope: Reels + Posts only, Stories explicitly deferred (no copyable-permalink equivalent — see [ARCHITECTURE.md](./ARCHITECTURE.md#own-private-content-flow-session-cookie-authenticated)). Backend: `POST /api/v1/private/fetch`, a separate endpoint (not a modification of `/fetch`), its own stricter rate limiter (3 req/10min vs. the public endpoint's 10/10min, confirmed live as two independent counters), server-side fail-closed ownership verification, and a session cookie that's in-memory/single-request-lifetime only — never stored, logged, or cached, confirmed live via real evidence (see [SECURITY.md](./SECURITY.md#post-mvp-private-account-support-own-content-only--implemented-2026-08-05)). Download itself reuses the existing, unmodified `GET /api/v1/download` proxy pipeline. Frontend UI (masked cookie input with show/hide toggle, in-page extraction guide, own `usePrivateContentFetch` state machine) confirmed live via screenshots.
- Session-expiry detection is confirmed live: a well-formed-but-fake session cookie sent against a real reel URL correctly returned `401 SESSION_EXPIRED`. **Not yet live-verified:** the actual authenticated happy path and the ownership-mismatch check specifically — both require a real, currently-valid session cookie from an account the tester controls, which isn't available in this environment (the same structural limitation as private-account detection above). See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#own-private-content-authenticated-extraction-unverified-2026-08-05).

## Explicitly out of MVP scope (post-MVP roadmap)

- Stories / Highlights parser (own-account Stories specifically evaluated and deferred 2026-08-05 as part of the own-private-content feature — see above)
- Profile bulk downloader
- Browser extension
- User search history
- Enterprise REST API

See [ROADMAP.md](./ROADMAP.md) for phasing and [TODO.md](./TODO.md) for active tasks.
