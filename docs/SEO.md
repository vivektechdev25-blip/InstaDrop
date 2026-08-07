# SEO

SEO is built in from day one, not an afterthought.

## Requirements

- Metadata (title/description) per page via Next.js `Metadata` API — see `apps/web/src/app/layout.tsx`
- OpenGraph and Twitter Card tags
- Canonical URLs
- `robots.txt` — generated dynamically via `apps/web/src/app/robots.ts` (Next.js file convention), not a static file, so it always agrees with `siteConfig.url`
- `sitemap.xml` — generated via `apps/web/src/app/sitemap.ts`
- JSON-LD structured data using the `WebApplication` schema — see `apps/web/src/app/layout.tsx`
- `FAQPage` JSON-LD structured data on the homepage — see below
- OG image — auto-generated via `apps/web/src/app/opengraph-image.tsx` (Next.js `next/og` convention); Next.js wires the `og:image`/`twitter:image` meta tags to it automatically
- PWA manifest — generated dynamically via `apps/web/src/app/manifest.ts` (Next.js file convention), served at `/manifest.webmanifest`. Converted from a static `public/manifest.json` on 2026-08-05 specifically so it reads its name/description from `siteConfig` instead of duplicating them (see below).

## Site config

`apps/web/src/lib/siteConfig.ts` is the single source of truth for the site's branding — canonical URL (`NEXT_PUBLIC_SITE_URL`, defaults to `https://reelsavehub.com`), `name`, `title`, `description`, and `tagline`. See [ARCHITECTURE.md](./ARCHITECTURE.md#branding-single-source-of-truth-siteconfigts) for the full list of consumers and the two deliberate exceptions.

## Targets

- Lighthouse SEO/Performance score > 95 — **achieved**: Performance 97, SEO 100, Accessibility 100, Best Practices 100 (real Lighthouse run against a production build after the homepage depth pass added TrustBar/HowItWorks/FeatureList/Faq — Performance dipped 2 points from the earlier 99, an expected, accepted cost of genuinely more content, not chased further). See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#homepage-depth-pass-2026-08-05-lighthouse-caught-a-real-pre-existing-contrast-bug) for the full before/after and a real accessibility bug this same audit caught (unrelated to the new content, fixed).
- LCP < 1.5s, FID < 100ms, CLS < 0.05 — CLS 0. LCP is **methodology-dependent**, investigated in full — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#lcp-investigation-2026-08-04-resolved-as-a-measurement-methodology-issue-not-a-code-defect). Under real (`devtools`) throttling, the homepage-depth-pass LCP is 1.6s (was 1.475s pre-pass) — a small, expected increase given substantially more homepage content, re-confirmed rather than assumed unaffected.

## Status

Implemented and confirmed live (production build + `next start`, not just typechecking):
- `GET /robots.txt` — correct `Allow: /` + `Sitemap:` pointing at `siteConfig.url`, plus a secondary `Disallow` layer (see the audit below)
- `GET /sitemap.xml` — all four routes (home + 3 legal pages) present with correct `<loc>`
- `GET /opengraph-image` — valid 1200x630 PNG (confirmed via `file`)
- Home page `<head>` — canonical `<link>`, full `og:*`/`twitter:*` tags (including the auto-wired image), and valid `WebApplication` JSON-LD, all confirmed present in the actual rendered HTML

Per-page metadata for the legal pages is no longer generic — each of the three (`/privacy-policy`, `/terms`, `/contact`) has its own unique, accurate `title`/`description` built through `siteConfig`, confirmed during the audit below.

## Ranking-focused audit — 2026-08-06

A full pass across metadata, structured data, heading hierarchy, semantic HTML, technical SEO, and Core Web Vitals — see [FEATURES.md](./FEATURES.md) for the summary entry. Real evidence throughout, not assumed.

**Already correct, confirmed rather than assumed:**
- Every page (`/`, `/privacy-policy`, `/terms`, `/contact`) has a unique title/description — no duplicate-description problem. Title template (`%s | ReelSaveHub`) centralized in `layout.tsx`, not repeated per page.
- Exactly one `<h1>` per page (confirmed on `/`, all 3 legal pages, `/private`); homepage h1→h2 (`HowItWorks`/`FeatureList`/`Faq`)→h3 (step titles), legal pages h1→h2 per `LegalSection` — no skipped levels.
- `<nav>`, `<main>`, `<footer>`, `<article>` all real and correctly used; the legal TOC (both the `lg:`+ sidebar and the mobile accordion) uses genuine `<a href="#section-id">` anchors, not JS-only scroll handlers — crawlable.
- `/private` and `[...url]` both carry their own `robots: { index: false, follow: false }`; the `?url=` case returns the same conditionally via `generateMetadata`. All three confirmed in code, not assumed.
- `FAQPage` JSON-LD is generated from the exact same `FAQ_ENTRIES` array the visible accordion renders (see "FAQPage structured data" above) — can't drift from the visible content.
- The one real `<img>` in the app (`MediaViewer.tsx`, the downloaded-content preview) has real `alt` text; decorative icons are `aria-hidden`; icon-only buttons have `aria-label`.
- No fabricated `AggregateRating`, review counts, or usage-stat claims anywhere — correctly absent, not overlooked.

**Real gap found and fixed — `robots.txt` had no `Disallow` rules.** Exclusion for `/private` and the `?url=` route relied entirely on their per-page `noindex` meta tag; `robots.txt` itself allowed everything. Per Google's own guidance, `noindex` (not `Disallow`) is the correct *primary* mechanism for reliable exclusion — a page blocked via `Disallow` can never be crawled to see its `noindex` tag, and can still surface as a bare URL-only result if linked from elsewhere. Added `Disallow: /private` and `Disallow: /*?url=` in `robots.ts` as a **secondary, crawl-budget-only** layer — safe specifically because both routes have been `noindex` since they were built, so there's nothing already-indexed to strand. The `[...url]` catch-all itself is deliberately **not** disallowed: it's an unbounded path pattern, not a fixed path, so there's no finite rule that excludes it without either over-blocking (catching real routes) or being too narrow to matter — its own `noindex` meta tag is the only mechanism that actually covers it. Confirmed live via `curl /robots.txt`.

**Added — `image` field on the `WebApplication` JSON-LD**, pointing at the real, deployed `icon-512.png` (not a placeholder). Confirmed the asset itself resolves (`200`) before referencing it.

**Explicitly not done, with reasoning (flagged before implementing, per the standing rule):**
- **`keywords` meta tag** — skipped entirely rather than added "sparingly." Google has publicly ignored this tag for ranking since ~2009; it's pure surface area for zero measurable return.
- **`BreadcrumbList` schema** — skipped. No page in this app has genuine multi-level hierarchy to represent; fabricating one just to have breadcrumb markup would be schema for its own sake.

**Lighthouse, before/after the above changes (production build, `simulate` throttling, matching the existing baseline methodology):** Performance 97, Accessibility 100, Best Practices 100, SEO 100 — unchanged in both directions; the robots.txt/JSON-LD additions introduced nothing new to fix.

### LCP re-investigation: genuine small regression, evidenced and accepted, not chased

The audit's `simulate`-mode LCP read 2.6s (score 0.88) — higher than the 2.2s this project's own [KNOWN_ISSUES.md LCP investigation](./KNOWN_ISSUES.md#lcp-investigation-2026-08-04-resolved-as-a-measurement-methodology-issue-not-a-code-defect) already documented as a `simulate`-mode overestimate. Re-ran with real `devtools` throttling (the same technique that investigation established as more trustworthy) rather than assuming the old excuse still fully covered it: **1.6s, score 0.99** — confirms `simulate` mode is still overestimating, but 1.6s is itself ~125ms higher than that investigation's own 1.475s `devtools` baseline. A small, genuine increase, not pure measurement noise.

Investigated with real profiling data rather than guessing which recent addition was responsible:
- LCP element (via Lighthouse's `lcp-breakdown-insight` audit): still the hero `<h1>`, same as the original investigation.
- Of the 1.6s, **Element Render Delay is ~1.55s** — Time to First Byte is a trivial ~61ms, so the cost is render-side, not network/server.
- `mainthread-work-breakdown`: Script Evaluation (662ms) + Style & Layout (416ms) together roughly account for the full delay — this is CPU contention under throttling, not one blocking resource (`render-blocking-resources` audit: none flagged).
- The single heaviest chunk by execution cost (522ms) is a shared runtime bundle; a separate chunk is **72% unused code** (25.8 KiB of 36 KiB, per `unused-javascript`) — consistent with a large animation library where only a fraction of its API is used on this page.

**Conclusion:** cumulative `framer-motion` usage growth across the recent visual passes (`HowItWorks`'s new `motion.path` arc animations most directly, on top of the pre-existing `whileInView` usage already in `FeatureList`/`Faq`/the hero section/`InstallModal`) is the real, evidenced cost — not any single feature in isolation, and not the hero scale-up (a typography/CSS change with no new JS).

**Recommendation: accept this, don't chase it further.** LCP still scores 0.99/1.0 and sits at 1.6s — comfortably under Google's 2.5s "good" threshold, only ~100ms over this project's own stricter internal <1.5s target. A real fix would mean deferring the `whileInView`-driven JS on `HowItWorks`/`FeatureList`/`Faq`, which risks breaking the scroll-reveal animations themselves (they need their `IntersectionObserver` set up early, right after mount, to correctly detect a *later* scroll into view — deferring that risks the sections either not animating at all or visibly "popping in" once a delayed script finally loads). Per this project's own standing rule against over-optimizing at the expense of already-approved UX, chasing a 100ms gap against an internal-only target isn't worth that risk. Documented here as an understood, evidenced, accepted cost rather than silently ignored or fixed at the expense of the animation work.

## FAQPage structured data

`app/page.tsx` emits a `FAQPage` JSON-LD block built directly from `components/marketing/faqData.ts` — the exact same array that renders the visible `Faq` accordion, so the structured data and the on-page copy can never drift out of sync with each other.

Homepage-only, and only on the plain view: skipped entirely when `?url=` is present (that variant is already `noindex` — see [ARCHITECTURE.md](./ARCHITECTURE.md#direct-url-mode-two-entry-points-one-pipeline) — so shipping schema for content search engines are told not to index would be pointless).

`faqData.ts` deliberately isn't exported from `Faq.tsx` itself: `Faq.tsx` is a `"use client"` module, and re-exporting plain data through a client-component file broke the server build — Next treats every export of a `"use client"` file as a client reference, so `page.tsx`'s server-side `.map()` over the FAQ list to build the JSON-LD failed at build time (`Attempted to call map() from the server but map is on the client`). Confirmed live via `next build`, not assumed; moving the data into its own plain module fixed it.

## PWA

- `apps/web/src/app/manifest.ts` — name, icons (192/512 PNG + a maskable 512 variant, generated to match the brand mark), `display: standalone`, theme/background colors. Generated dynamically (served at `/manifest.webmanifest`), not the static `public/manifest.json` this section used to describe — see "Requirements" above.
- `apps/web/public/sw.js` — hand-rolled service worker (not a library): network-first for navigations (always latest when online, falls back to the cached shell offline), cache-first for everything else (JS/CSS chunks, icons), populating the cache as assets are fetched.
- `apps/web/src/hooks/useServiceWorker.ts` registers it, gated to production only (service workers fight with dev-mode hot-reload, a well-known footgun — confirmed intentional, not an oversight).

**Confirmed live** (production build, real Chromium via Playwright, not just code review):
- Service worker registers and reaches `activated` state, zero console errors
- App shell (`/`, JS/CSS chunks, prefetched legal pages) actually populates the cache
- **Actually went offline** (`context.setOffline(true)`) and reloaded — the real UI still rendered from cache, not just an inference from "the code looks right"

Not independently verified: the literal browser "Add to Home Screen" install prompt UI (`beforeinstallprompt`), since that requires a full browser session rather than headless automation. All of the underlying technical criteria Chrome checks before offering that prompt — valid manifest with icons/name/start_url/display, served over HTTPS or localhost, a registered service worker with a fetch handler — are confirmed met. A custom `InstallModal` now wraps this event (see [ARCHITECTURE.md](./ARCHITECTURE.md#pwa-install-prompt-system)) and has been fully verified against a synthetic version of the event; the real-browser confirmation that Chrome actually fires it against this app remains the one pending manual step — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#real-browser-beforeinstallprompt-confirmation-pending-manual-not-fabricated).
