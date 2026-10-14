# Security

## Global rules (always apply)

- Helmet, CORS, rate limiting, environment variables, input validation, output sanitization, secure headers — always.
- Never expose secrets or API keys.
- Never trust frontend validation — always validate on the backend (Zod schemas in `apps/api/src/validators`).
- Never log sensitive information (cookies, tokens, credentials).
- IP addresses hashed with SHA-256 + a daily rotating salt before storage — this describes the *intended* design of `requestLogRepository`/`RequestLog` (schema and insert logic are fully implemented), **not current active behavior**: confirmed via a full-codebase grep (2026-08-05, while fact-checking the legal pages overhaul) that nothing in `apps/api` actually calls `requestLogRepository.insert()` — no controller or middleware is wired up to it. Request logging is not currently happening at all. Wiring it up is tracked as a separate follow-up, not bundled into any pass so far. See [docs/FEATURES.md](./FEATURES.md#legal-pages-structured-sectioned-sidebar-navigation--2026-08-05) for where this was caught.

## Rate limiting

Three independent budgets, one `express-rate-limit` instance each, all in-memory (`apps/api/src/middlewares/rateLimiter.ts`, sized in `apps/api/src/constants/rateLimit.ts`). Exhausting one never affects the others — confirmed live via the `RateLimit-Policy` header each endpoint returns:

| Endpoint | Budget | Why this number |
|---|---|---|
| `POST /api/v1/fetch` | 10 / 10 min / IP | Each request can cost a full browser render; this is the expensive operation worth throttling. |
| `GET /api/v1/download` | 60 / 10 min / IP | **Changed 2026-10-14** — previously shared `/fetch`'s single 10-request counter, which meant one fetch plus saving the slides of a real carousel (up to 20 downloads) tripped a 429 partway through the user's own download. Downloads are bandwidth, not extraction, so they get a budget sized for "every slide of a long carousel, twice" — still capped, since the endpoint is an outbound proxy. |
| `POST /api/v1/private/fetch` | 3 / 10 min / IP | Authenticates with a real session cookie — higher stakes than an anonymous public fetch. |

This is sufficient for the MVP's single-instance Railway deployment.

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

**Upstream timeout.** Getting response headers back is capped at 15s; the body stream deliberately is not, since a real reel is tens of megabytes. Without the first cap, a host that accepts the connection and never answers held the request open indefinitely — Express sets no default timeout. The stream is also torn down when the client disconnects mid-download, instead of continuing to pull CDN bytes into a response nobody is reading.

## CORS

`cors({ origin: corsOrigins })` in `apps/api/src/app.ts`, where `corsOrigins` comes from `parseCorsOrigins(process.env.CORS_ORIGIN)` in `config/env.ts`, an exact-match allowlist. History: before deployment prep, the code called `cors()` with **no arguments**, which the `cors` package treats as allowing every origin (`Access-Control-Allow-Origin: *`). That silently contradicted the documented config, and it was fixed to read the env var.

- **Fails safe when unset:** the default is `http://localhost:3000`, never a wildcard. A missing `CORS_ORIGIN` in production blocks the real frontend (loudly, obviously broken) rather than allowing any origin.
- **Fails fast when malformed (2026-10-14):** entries are compared to the browser's `Origin` header by exact string, and browsers always send a bare, lowercase `scheme://host[:port]`. A trailing slash, a path, a mixed-case host or `*` used to be accepted and then silently never match. Each now stops the boot with the exact value to use. Verified in the production container and covered by `env.test.ts`.
- **Netlify deploy previews are deliberately not allowed** to call the production API: no `*.netlify.app` pattern, only explicit origins. Covered by `app.test.ts`.

**Production deployment must set `CORS_ORIGIN` to the exact deployed frontend origin(s)**; see [DEPLOYMENT.md](./DEPLOYMENT.md).

For a disallowed `Origin`, the response simply carries no `Access-Control-Allow-Origin`. The browser enforces that by blocking the calling page's JavaScript from reading it; the server doesn't refuse the request outright.

## Error responses and logging (2026-10-14)

- **Clients only ever receive the response envelope:** a static message plus a machine-readable `code`. They never get stack traces, file paths or Playwright messages. Tested for validation errors, 404s, unknown errors, and an all-tiers-failed 502 whose underlying error mentions an internal path.
- **Logs record the stack (which includes the message), never the whole error object.** An error's enumerable properties can carry request data. The `express.json()` parse error carries the raw body, so a malformed `/private/fetch` request used to write the caller's session cookie to the logs, and get a 500 for what is a 400 client error. That leak was reproduced directly against the original handler before it was fixed.
- **In the own-private-content flow, unexpected errors have the session cookie (raw and URL-decoded) redacted before logging**, even though Playwright's errors aren't expected to contain it. "Not expected to" is an assumption about a third-party library's error text, and the cost of it being wrong once is a live credential in the logs.

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
- `apps/api/src/repositories/requestLogRepository.ts` is unused dead code — confirmed via `grep` across the codebase, nothing calls it. `RequestLog`'s own DB columns are `hashed_ip`/`endpoint`/`status_code`/`id`/`created_at` only — there is no column a raw cookie value could land in even if it were wired up.
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
