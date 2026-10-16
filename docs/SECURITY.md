# Security

## Global rules (always apply)

- Helmet, CORS, rate limiting, environment variables, input validation, output sanitization, secure headers — always.
- Never expose secrets or API keys.
- Never trust frontend validation — always validate on the backend (Zod schemas in `apps/api/src/validators`).
- Never log sensitive information (cookies, tokens, credentials).
- No request logging and no IP storage at all. An anonymous request-log design (IPs hashed with SHA-256 + a daily rotating salt) was scaffolded early on but never called — caught 2026-08-05 while fact-checking the legal pages (see [docs/FEATURES.md](./FEATURES.md#legal-pages-structured-sectioned-sidebar-navigation--2026-08-05)) — and the unused code was removed on 2026-10-16. If logging is ever built, the hashing rule above is the requirement.

## Rate limiting

Three independent budgets, one `express-rate-limit` instance each, all in-memory (`apps/api/src/middlewares/rateLimiter.ts`, sized in `apps/api/src/constants/rateLimit.ts`). Exhausting one never affects the others — confirmed live via the `RateLimit-Policy` header each endpoint returns:

| Endpoint | Budget | Why this number |
|---|---|---|
| `POST /api/v1/fetch` | 10 / 10 min / IP | Each request can cost a full browser render; this is the expensive operation worth throttling. |
| `GET /api/v1/download` | 60 / 10 min / IP | **Changed 2026-10-14** — previously shared `/fetch`'s single 10-request counter, which meant one fetch plus saving the slides of a real carousel (up to 20 downloads) tripped a 429 partway through the user's own download. Downloads are bandwidth, not extraction, so they get a budget sized for "every slide of a long carousel, twice" — still capped, since the endpoint is an outbound proxy. |
| `POST /api/v1/private/fetch` | 3 / 10 min / IP | Authenticates with a real session cookie — higher stakes than an anonymous public fetch. |

This is sufficient for the MVP's single-instance Railway deployment.

**Keyed on the real client — fixed 2026-10-15.** Measured on production: from one stable client IPv4 address, consecutive requests to `/download` landed in two or three different buckets (`RateLimit-Remaining` 57, 55, 58, 56, 54, 53). With `trust proxy = 1`, `req.ip` resolved to whichever Railway-internal proxy forwarded the request, because Railway's edge reaches the container through more than one hop. The limiter was therefore keyed per proxy, not per client: strangers shared buckets, and any one user's effective budget was a multiple of the advertised one.

Railway does not document its hop count, and answers from its own staff contradict each other. So trust is now defined by **address class**, not count: loopback, link-local, private and RFC 6598 shared space (`100.64.0.0/10`, used inside Railway) are proxies; the client is the right-most *public* address in `X-Forwarded-For`. That cannot be spoofed — a forged entry always sits to the left of the address Railway's edge observed, and the walk stops before reaching it. Tested with varying proxy hops, forged entries (including a forged `100.64.x`), and distinct clients. `TRUST_PROXY` overrides it without a deploy if Railway's forwarding changes, and the API logs once per process whether the key resolved to a public address. `proxy-addr` is pinned to 2.0.8, which fixes IP spoofing through IPv4-mapped IPv6 addresses in exactly this kind of subnet trust (GHSA-jqcg-44mw-7w3h).

**Callers are told how long to wait.** Every 429 carries `Retry-After`, its message states the wait in minutes, and the API now lists `Retry-After` and `RateLimit-*` in `Access-Control-Expose-Headers` — before, the cross-origin frontend received the 429 but could not read when it would lift.

**Note:** in-memory rate limiting only holds its limit correctly on a single instance. If the API scales horizontally (multiple Render instances), each instance tracks its own counters, so the effective limit multiplies with instance count. Revisit with a distributed store (e.g. Redis-backed sliding window) before scaling out — see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp) and [TODO.md](./TODO.md).

## Direct URL mode: auto-fetch throttling

`?url=` and the `reelsavenow.com/<instagram-url>` catch-all route (see [ARCHITECTURE.md](./ARCHITECTURE.md#direct-url-mode-two-entry-points-one-pipeline)) both auto-trigger a fetch without a manual click — the natural throttle a manual paste provides doesn't exist for either. Two entry points instead of one means this matters more, not less: a scripted loop could otherwise hit `?url=X1`, `?url=X2`, ... or `reelsavenow.com/<url1>`, `reelsavenow.com/<url2>`, ... with zero human interaction.

Mitigations, each confirmed live rather than assumed:
- **Shared rate limit, no separate budget.** Both entry points call the identical `apiClient.post("/fetch")` used by the manual flow, so they're covered by the same `express-rate-limit` counter (10 req / 10 min / IP) with no code path that could bypass it. Confirmed live: tripped the limiter via direct requests, then verified a fresh request through *each* entry point independently returns the same `RATE_LIMITED` state through the real UI (toast + inline message), not a raw API error.
- **`noindex` on both.** The catch-all route carries static `robots: { index: false }` metadata; the homepage conditionally sets the same via `generateMetadata` only when `?url=` is present (the plain homepage stays indexable). Confirmed live via `curl` against the rendered `<head>`. Without this, an unbounded number of `?url=<post>` / `reelsavenow.com/<post>` combinations could otherwise be crawled and indexed as distinct pages.
- **No silent fetching.** The auto-triggered fetch goes through the same `VALIDATING → FETCHING → SUCCESS|ERROR` state machine as a manual submission — the same visible loading skeleton, on both entry points, not a background request the user can't see.
- **Garbage catch-all paths fail cleanly.** `[...url]` technically matches any unmatched path (e.g. `reelsavenow.com/some/random/thing`). This is not special-cased — it flows through the same validator that already rejects malformed input, showing the existing friendly error UI. Confirmed live: `HTTP 200`, no stack trace, no unhandled exception, no console errors.

## Download endpoint SSRF protection

`GET /api/v1/download` proxy-streams whatever `url` it's given. Without a check, that makes it an open proxy — the API would fetch and relay *any* URL a caller supplies, which could be pointed at internal infrastructure or used to mask the origin of unrelated requests. `downloadMediaSchema.ts` restricts `url` to `*.cdninstagram.com` / `*.fbcdn.net` hostnames before the API ever makes the upstream request. Confirmed live: a non-Instagram-CDN URL is rejected with `400 INVALID_URL`.

**Redirects are validated per hop (added 2026-10-14).** The schema check above only ever sees the URL the *caller* submitted. `fetch`'s default behavior follows redirects silently, so an allowlisted CDN URL that 302s somewhere else would have been followed without the allowlist ever seeing the second hop — the exact hole the allowlist exists to close. `downloadService.ts` now requests with `redirect: "manual"` and re-checks every hop's hostname against the same shared allowlist (`apps/api/src/constants/allowedCdnHosts.ts`, one definition used by both the schema and the service) before requesting it, with a 5-hop ceiling. Verified live against a real `*.fbcdn.net` media URL (complete 21.6MB MP4 streamed through correctly) and against a non-CDN URL (`400 INVALID_URL`). The off-allowlist branch is now **unit-tested** with a URL-keyed `fetch` stub. Off-allowlist targets, http downgrades and `file:`/`data:`/`javascript:` Locations are rejected *without being requested*, and removing the per-hop check fails 5 tests. A real CDN host redirecting off-allowlist has never been observed live.

**HTTPS only (2026-10-14).** The shared check is `isAllowedCdnUrl()`: an `https:` scheme **and** an allowlisted host. Every real CDN URL is https. Plain http would let anything on the network path between the API and the CDN substitute the file being streamed, and other schemes are never legitimate media sources.

**Hostname edge cases, tested:** a bare `fbcdn.net`, suffix lookalikes (`evilfbcdn.net`), the allowlisted name used as a subdomain (`fbcdn.net.evil.com`), trailing-dot hosts, IDN lookalikes (which become punycode and no longer match) and IP literals are all rejected. **Assessed, not mitigated:** the check is on hostnames, not resolved IPs. An allowlisted name resolving to a private address would need control of Meta's own DNS, so pinning resolved IPs was judged not worth its complexity.

**Explicit ports and embedded credentials are refused (2026-10-15)** even on an allowlisted host. No real CDN link has either, and both widen what a caller can make the server do: a port turns the proxy into a port prober against those hosts, and `user:pass@` is forwarded upstream as credentials the caller chose.

**Unparseable input is a 400, not a 500 (2026-10-15).** Zod runs a refinement even after an earlier check on the same string has failed, and the refinement called `new URL()`, which throws. Measured on production: `?url=x` answered 500 and logged a stack trace — a cheap way to flood the logs. The check now has a non-throwing form, and URLs are capped at 4096 characters.

**Only media is relayed, within bounds (2026-10-15).** The allowlisted CDNs serve more than Instagram media, so a response is relayed only if its `Content-Type` is `video/*`, `image/*` or `audio/*` and it is no larger than 300MB (declared or counted). A body that goes 30s without a byte is cut off, so a stalled upstream cannot hold a transfer — and its slot — open. At most 32 transfers run at once; past that the answer is 503. Memory was never the constraint (40 clients that stop reading mid-transfer peaked at 94MB, because `pipe()` propagates backpressure); sockets and bandwidth were, and the rate limit bounds requests per window, not requests at once.

**Upstream timeout.** Getting response headers back is capped at 15s; the body stream deliberately is not, since a real reel is tens of megabytes. Without the first cap, a host that accepts the connection and never answers held the request open indefinitely — Express sets no default timeout. The stream is also torn down when the client disconnects mid-download, instead of continuing to pull CDN bytes into a response nobody is reading.

## CORS

`cors({ origin: corsOrigins })` in `apps/api/src/app.ts`, where `corsOrigins` comes from `parseCorsOrigins(process.env.CORS_ORIGIN)` in `config/env.ts`, an exact-match allowlist. History: before deployment prep, the code called `cors()` with **no arguments**, which the `cors` package treats as allowing every origin (`Access-Control-Allow-Origin: *`). That silently contradicted the documented config, and it was fixed to read the env var.

- **Fails safe when unset:** the default is `http://localhost:3000`, never a wildcard. A missing `CORS_ORIGIN` in production blocks the real frontend (loudly, obviously broken) rather than allowing any origin.
- **Fails fast when malformed (2026-10-14):** entries are compared to the browser's `Origin` header by exact string, and browsers always send a bare, lowercase `scheme://host[:port]`. A trailing slash, a path, a mixed-case host or `*` used to be accepted and then silently never match. Each now stops the boot with the exact value to use. Verified in the production container and covered by `env.test.ts`.
- **Netlify deploy previews are deliberately not allowed** to call the production API: no `*.netlify.app` pattern, only explicit origins. Covered by `app.test.ts`.

**Production deployment must set `CORS_ORIGIN` to the exact deployed frontend origin(s)**; see [DEPLOYMENT.md](./DEPLOYMENT.md).

**Narrowed and readable (2026-10-15):** methods are limited to `GET` and `POST`, preflights are cached for 10 minutes, and the rate-limit headers are exposed so the frontend can tell users when to retry.

For a disallowed `Origin`, the response simply carries no `Access-Control-Allow-Origin`. The browser enforces that by blocking the calling page's JavaScript from reading it; the server doesn't refuse the request outright.

## Error responses and logging (2026-10-14)

- **Clients only ever receive the response envelope:** a static message plus a machine-readable `code`. They never get stack traces, file paths or Playwright messages. Tested for validation errors, 404s, unknown errors, and an all-tiers-failed 502 whose underlying error mentions an internal path.
- **Logs record the stack (which includes the message), never the whole error object.** An error's enumerable properties can carry request data. The `express.json()` parse error carries the raw body, so a malformed `/private/fetch` request used to write the caller's session cookie to the logs, and get a 500 for what is a 400 client error. That leak was reproduced directly against the original handler before it was fixed.
- **In the own-private-content flow, unexpected errors have the session cookie (raw and URL-decoded) redacted before logging**, even though Playwright's errors aren't expected to contain it. "Not expected to" is an assumption about a third-party library's error text, and the cost of it being wrong once is a live credential in the logs.

## Request parsing and server timeouts (2026-10-15)

- **Query strings are parsed with Node's `querystring`, not `qs`.** No endpoint takes nested or array parameters, so the extended parser was pure attack surface carrying two open advisories (GHSA-4mjr-xmp4-gh2g, a DoS; GHSA-x5fp-wj9c-mxmx, an array-limit bypass). They are no longer in the request path at all.
- **JSON bodies are capped at 8kb**, down from the 100kb default. The largest legitimate body is a URL plus a session cookie of at most 1000 characters.
- **Slow requests are cut off.** Headers must arrive within 15s and the whole request within 20s (Node's defaults: 60s and 300s), so a client cannot hold sockets open by trickling a request in. Response streaming is unaffected.

## Frontend headers (2026-10-15)

Before this, the site sent only Netlify's defaults (HSTS and `nosniff`). It now sends, from `apps/web/securityHeaders.cjs` via `next.config.js`:

- **Content-Security-Policy** built from an inventory of what the site loads: no third-party scripts, fonts, analytics or frames. `connect-src` allows only this origin and the API; `img-src` / `media-src` only Instagram's CDN; `object-src`, `frame-ancestors` and `base-uri` are locked. `script-src` keeps `'unsafe-inline'` because the App Router streams its payload in inline scripts and the theme is set by one before first paint — removing it needs per-request nonces, which a statically served page cannot carry. Verified in real Chromium against the production build: the full paste → preview → download flow and every page, in light and dark mode, with **zero** CSP violations and zero console errors.
- **X-Frame-Options: DENY**, **Referrer-Policy: strict-origin-when-cross-origin**, **Permissions-Policy** (camera, microphone, geolocation, payment, USB off), **Cross-Origin-Opener-Policy: same-origin**, and HSTS restated so it does not depend on a platform default. No `includeSubDomains` or `preload`: both commit every subdomain to HTTPS, and preload cannot be quickly undone.

**The image optimizer was an open proxy — closed 2026-10-15.** Nothing renders `next/image`, but `images.remotePatterns` still enabled `/_next/image` for Instagram's CDN. Verified on production: `reelsavenow.com/_next/image?url=<any cdninstagram.com image>` fetched and served it (200, `image/jpeg`) — bandwidth and transforms billed to this site, through the endpoint several open Next.js advisories target. Images are now unoptimized with no remote hosts; the same request returns 404.

## Dependency advisories (audited 2026-10-15)

`pnpm audit` reported 56 advisories. Triaged by whether production code can reach them:

| Package | Where it runs | Action |
|---|---|---|
| `proxy-addr` < 2.0.8 (critical, IP spoofing) | API, every request | **Pinned to 2.0.8** — reachable once trust became subnet-based |
| `qs` < 6.16 (2 × moderate) | API query parsing | **Removed from the request path** (see above) |
| `axios` < 1.20 (11, up to high) | API Tier 1 scraper; web client | **Pinned to 1.20.0** in both |
| `next` 14.2.35 (critical/high, patched only in 15.5.x) | Web | **Not fixed — needs a major upgrade, see below.** Reachable surface reduced: image optimizer disabled; no middleware, server actions, rewrites, i18n or WebSockets are used; the Windows-only RCE does not apply to Netlify |
| `vitest`, `vite`, `esbuild`, `tinypool`, `nanoid`, `source-map-js` | Dev and test tooling only | Not reachable in production |
| `postcss`, `braces`, `glob`, `postcss-selector-parser` | Build tooling (our own CSS) | Not reachable in production |

**Open: Next.js 14 → 15.** The remaining reachable advisories (React Server Components DoS, cache poisoning) are fixed only in Next 15.5.x. That upgrade requires React 19 and the async request-API changes — a migration, not a patch, and kept out of this change deliberately.

**Open: dev dependencies ship in the API image.** The runner stage copies the full `node_modules` from the deps stage, so test tooling is present (never executed) in production. A production-only install stage would shrink the image; it was left alone because getting the workspace symlinks right in this Dockerfile took four rounds of real builds the first time.

## Private account handling

### MVP behavior (public accounts only)

```
User pastes URL -> Backend validates -> Backend detects private account
  -> Stop processing -> Return PRIVATE_ACCOUNT error -> Friendly UI message
```

No workaround. No credential collection. No exceptions.

### Post-MVP: private account support (own content only) — implemented 2026-08-05

Recommended approach: **session cookie, own content only**. Options evaluated:

| Option | Feasibility | Legal | Security | Verdict |
|---|---|---|---|---|
| Instagram Basic Display API | None (deprecated 2024) | N/A | N/A | Dead |
| Instagram Graph API | Limited (Business/Creator only) | Safe | Safe | Too narrow |
| Direct credential collection | High | Illegal (ToS violation) | Dangerous | Never |
| **Session cookie (own content only)** | High | Safe | Safe (if done right) | **Recommended — built** |

**Workflow (as built, `POST /api/v1/private/fetch`):**
1. User navigates directly to `/private` — a separate page, not linked from `Navbar`/`Footer`, `noindex`. The public flow never prompts for a cookie.
2. User extracts their own Instagram `sessionid` cookie via an in-UI guided accordion (`CookieHelpGuide.tsx`: DevTools → Application → Cookies → `sessionid`)
3. User pastes the cookie into a dedicated, masked input (`type="password"` with a show/hide toggle), `autoComplete="off"`, `data-1p-ignore`/`data-lpignore` to suppress password-manager save prompts
4. Backend attaches the cookie to a fresh Playwright `BrowserContext`, navigates to the requested URL. A redirect to `/accounts/login/` means the cookie is invalid/expired → `SESSION_EXPIRED`
5. Backend extracts both the authenticated viewer's identity and the requested content's owner identity from the same page load, and fails closed (`ACCESS_DENIED`) unless they match exactly — missing/unparseable owner data is treated as a denial, never an implicit pass. Never trusts a client-supplied claim of ownership.
6. Media extraction reuses the exact same helpers (`mediaExtractionHelpers.ts`) as the public Playwright tier — no parallel/duplicated extraction logic.
7. The download itself reuses the existing, unmodified `GET /api/v1/download` proxy-stream pipeline (same SSRF guard, same header handling) — the cookie is not needed again at this step, since by then the response already carries a direct, cookie-independent CDN URL.

**Non-negotiable rules — status:**
- Never store session cookies (in-memory only, per-request) — **done.** Scoped to one Playwright `BrowserContext` created and `close()`d (in a `finally` block) within a single request; never written to a database, log, cache, or any file.
- HTTPS enforced on all endpoints handling cookies — deployment-time requirement, not app-code-enforceable in this local environment; noted for [DEPLOYMENT.md](./DEPLOYMENT.md).
- Cookies redacted from all logs — **confirmed live**, see below.
- Stricter rate limit than the public endpoint — **done and confirmed live.** 3 req / 10 min / IP (`PRIVATE_CONTENT_RATE_LIMIT` in `apps/api/src/constants/rateLimit.ts`), a genuinely separate `express-rate-limit` instance (`createRateLimiters().privateContent` in `middlewares/rateLimiter.ts`) from the public endpoint's 10/10min — tripping one's budget confirmed live not to affect the other's.
- Server-side ownership verification on every request, never trusting client claims — **done, fail-closed by design; the specific extraction logic is not yet live-verified** (see [ARCHITECTURE.md](./ARCHITECTURE.md#own-private-content-flow-session-cookie-authenticated) and [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#own-private-content-authenticated-extraction-unverified-2026-08-05)).
- Clear user disclosure before first use — **done.** `/private`'s page copy states plainly what the cookie is used for and its single-request lifetime before the form.
- Detect and handle expired sessions with a clear `SESSION_EXPIRED` error — **done and confirmed live.** A well-formed-but-fake `sessionCookie` sent against a real reel URL correctly returned `401 SESSION_EXPIRED`, confirming the `/accounts/login/` redirect-detection path fires against real Instagram, not just in code review.

**Log-redaction, confirmed live, not assumed:**
- There is no database or request log for a cookie value to land in: the never-called `requestLogRepository` (whose columns were `hashed_ip`/`endpoint`/`status_code`/`id`/`created_at` only) was removed as dead code on 2026-10-16.
- `apps/api/src/app.ts` has no request-body-logging middleware.
- Zod's `flatten().fieldErrors`, which `errorHandler.ts` returns for validation failures, was confirmed via direct script execution to contain only static validation message strings — never the submitted field value — so a malformed-cookie request never echoes the cookie back in its own error response.
- `privateContentService.ts` wraps its Playwright/extraction logic in a try/catch that raises sanitized `AppError`s (`SESSION_EXPIRED`/`ACCESS_DENIED`/a generic server error) before anything reaches `errorHandler.ts`'s catch-all `console.error` — an unexpected internal exception (which could theoretically stringify a value containing the cookie in some edge case) never gets a bare, unsanitized log line at that final layer.

### Explicitly rejected approach

Storing Instagram usernames/passwords in the database — plain text or reversible/decryptable — was proposed and **rejected**:
- A single database breach would compromise every stored Instagram account
- Admin-level decrypt access is itself a massive insider-abuse vector
- Direct violation of Instagram's Terms of Service
- Legal exposure under data protection law (GDPR / IT Act)

If revisited, only irreversible hashing (e.g. bcrypt) is acceptable, and only for ReelSaveNow's own authentication — never for storing third-party (Instagram) credentials in recoverable form.

## Threat model summary

| Risk | Mitigation |
|---|---|
| Instagram upstream DOM changes | Multi-tier fallback scraper pipeline, decoupled via standardized JSON interface |
| CDN IP rate blocking (429s) | Rotating proxy pools for outgoing scrape requests |
| Legal / copyright exposure | No media stored on servers, prominent fair-use disclaimer, Terms of Service page |
| Private account credential misuse | Session-cookie-only approach, no persistent storage, strict server-side ownership checks |
