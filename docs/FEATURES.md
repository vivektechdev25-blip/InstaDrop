# Features

## MVP scope (5-day target)

- [x] Single photo/video/reel/carousel URL parsing — confirmed live against real posts, including 9/9 real carousel posts; private-account detection implemented but unverified (confirmed non-blocking), see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [x] Direct CDN link retrieval — `GET /api/v1/download` confirmed live for image, video, and carousel slides, correct headers and complete valid files
- [x] Media preview player — `PreviewCard`/`MediaViewer` (video player, carousel prev/next + dots), confirmed live in a real browser for image, video, and carousel posts
- [x] Responsive dark/light UI — **verified, not assumed**: real screenshots + programmatic overflow/touch-target checks at 5 breakpoints (375/430/768/1024/1440px), see [TESTING.md](./TESTING.md#responsive-verification-permanent-requirement-baseline-established-2026-08-04)
- [ ] Serverless edge API
- [x] Rate limiting (in-memory `express-rate-limit` for MVP — see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp))
- [x] Complete SEO setup — metadata, OG/Twitter, JSON-LD, sitemap, dynamic robots.txt, all confirmed live, see [SEO.md](./SEO.md)
- [x] Direct URL mode — two entry points that skip the manual paste-and-click: `?url=<instagram-url>` (query param, for shared links) and `instadrop.com/<instagram-url>` (address-bar shortcut, catch-all route). Both auto-fill the input and auto-trigger the same fetch flow through the real `VALIDATING → FETCHING → SUCCESS|ERROR|RATE_LIMITED` state machine — no silent background fetch, no duplicated validation or fetch logic. Both `noindex`, and both confirmed live to share the exact same backend rate limiter as the manual flow (no separate budget, no bypass). See [ARCHITECTURE.md](./ARCHITECTURE.md#direct-url-mode-two-entry-points-one-pipeline).

## Progressive Web App

- [x] Installable app shell — manifest with real icons, hand-rolled service worker (network-first navigations, cache-first assets), confirmed live including an actual offline reload test. See [SEO.md](./SEO.md#pwa).
- [x] Install prompt system — `InstallModal` + `InstallButton`, global (not page-scoped), with a ~2.5s show delay, a 3-day/3-visit dismissal cooldown, and a 3-dismissal permanent opt-out cap. Focus-trapped, `aria-modal`, Escape-to-dismiss. Full behavioral suite (show delay, install/dismiss/escape flows, dismissal cap, aria-modal, touch targets) confirmed live via Playwright with a synthetic `beforeinstallprompt` event, and confirmed clean at all 5 responsive breakpoints (375/430/768/1024/1440px) — see [ARCHITECTURE.md](./ARCHITECTURE.md#pwa-install-prompt-system). **Not yet verified:** a real, non-automated Chrome session actually firing `beforeinstallprompt` end-to-end — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). iOS Safari never fires this event at all (documented limitation, no instructional fallback built).
- [ ] `InstallBanner` — lower-priority alternative surface, not yet built (confirmed lowest priority by the user 2026-08-04; build only if time allows).

## Explicitly out of MVP scope (post-MVP roadmap)

- Stories / Highlights parser
- Profile bulk downloader
- Browser extension
- User search history
- Enterprise REST API
- Private account support (own content only — see [SECURITY.md](./SECURITY.md))

See [ROADMAP.md](./ROADMAP.md) for phasing and [TODO.md](./TODO.md) for active tasks.
