# Testing

Every feature must be manually tested before being considered done. Explicitly cover:

- Edge cases (malformed URLs, non-Instagram URLs, deleted posts)
- Empty states
- Loading states
- Network failures
- Rate-limit states (`RATE_LIMITED`)
- Invalid URLs
- Private account responses (`PRIVATE_ACCOUNT`)

## Status

No automated test suite exists yet — everything so far has been verified through live manual/scripted testing against the real running app (curl against the API, Playwright-driven browser checks against the dev/production builds, real Docker builds), not just typechecking. See [CHANGELOG.md](./CHANGELOG.md) for what's been confirmed this way feature by feature.

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

## Known test gaps

- Carousel extraction and private-account detection are implemented but not live-verified — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
- No automated regression suite — every verification described in [CHANGELOG.md](./CHANGELOG.md) was a one-off manual/scripted check, not something that re-runs on future changes.
