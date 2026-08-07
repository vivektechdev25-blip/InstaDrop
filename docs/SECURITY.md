# Security

## Global rules (always apply)

- Helmet, CORS, rate limiting, environment variables, input validation, output sanitization, secure headers — always.
- Never expose secrets or API keys.
- Never trust frontend validation — always validate on the backend (Zod schemas in `apps/api/src/validators`).
- Never log sensitive information (cookies, tokens, credentials).
- IP addresses hashed with SHA-256 + a daily rotating salt before storage — this describes the *intended* design of `requestLogRepository`/`RequestLog` (schema and insert logic are fully implemented), **not current active behavior**: confirmed via a full-codebase grep (2026-08-05, while fact-checking the legal pages overhaul) that nothing in `apps/api` actually calls `requestLogRepository.insert()` — no controller or middleware is wired up to it. Request logging is not currently happening at all. Wiring it up is tracked as a separate follow-up, not bundled into any pass so far. See [docs/FEATURES.md](./FEATURES.md#legal-pages-structured-sectioned-sidebar-navigation--2026-08-05) for where this was caught.

## Rate limiting

Public endpoints: 10 requests / 10 minutes / IP via `express-rate-limit`, in-memory (`apps/api/src/middlewares/rateLimiter.ts`). This is sufficient for the MVP's single-instance Railway deployment.

**Note:** in-memory rate limiting only holds its limit correctly on a single instance. If the API scales horizontally (multiple Railway instances), each instance tracks its own counters, so the effective limit multiplies with instance count. Revisit with a distributed store (e.g. Redis-backed sliding window) before scaling out — see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp) and [TODO.md](./TODO.md).

## Direct URL mode: auto-fetch throttling

`?url=` and the `reelsavehub.com/<instagram-url>` catch-all route (see [ARCHITECTURE.md](./ARCHITECTURE.md#direct-url-mode-two-entry-points-one-pipeline)) both auto-trigger a fetch without a manual click — the natural throttle a manual paste provides doesn't exist for either. Two entry points instead of one means this matters more, not less: a scripted loop could otherwise hit `?url=X1`, `?url=X2`, ... or `reelsavehub.com/<url1>`, `reelsavehub.com/<url2>`, ... with zero human interaction.

Mitigations, each confirmed live rather than assumed:
- **Shared rate limit, no separate budget.** Both entry points call the identical `apiClient.post("/fetch")` used by the manual flow, so they're covered by the same `express-rate-limit` counter (10 req / 10 min / IP) with no code path that could bypass it. Confirmed live: tripped the limiter via direct requests, then verified a fresh request through *each* entry point independently returns the same `RATE_LIMITED` state through the real UI (toast + inline message), not a raw API error.
- **`noindex` on both.** The catch-all route carries static `robots: { index: false }` metadata; the homepage conditionally sets the same via `generateMetadata` only when `?url=` is present (the plain homepage stays indexable). Confirmed live via `curl` against the rendered `<head>`. Without this, an unbounded number of `?url=<post>` / `reelsavehub.com/<post>` combinations could otherwise be crawled and indexed as distinct pages.
- **No silent fetching.** The auto-triggered fetch goes through the same `VALIDATING → FETCHING → SUCCESS|ERROR` state machine as a manual submission — the same visible loading skeleton, on both entry points, not a background request the user can't see.
- **Garbage catch-all paths fail cleanly.** `[...url]` technically matches any unmatched path (e.g. `reelsavehub.com/some/random/thing`). This is not special-cased — it flows through the same validator that already rejects malformed input, showing the existing friendly error UI. Confirmed live: `HTTP 200`, no stack trace, no unhandled exception, no console errors.

## Download endpoint SSRF protection

`GET /api/v1/download` proxy-streams whatever `url` it's given. Without a check, that makes it an open proxy — the API would fetch and relay *any* URL a caller supplies, which could be pointed at internal infrastructure or used to mask the origin of unrelated requests. `downloadMediaSchema.ts` restricts `url` to `*.cdninstagram.com` / `*.fbcdn.net` hostnames before the API ever makes the upstream request. Confirmed live: a non-Instagram-CDN URL is rejected with `400 INVALID_URL`.

## CORS

`app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" }))` in `apps/api/src/app.ts`. Found live while preparing for deployment: `CORS_ORIGIN` was documented in `.env.example` but the code was calling `cors()` with **no arguments at all** — the `cors` package's default is to allow every origin (`Access-Control-Allow-Origin: *`), silently contradicting the documented config. Fixed to actually read the env var.

Defaults to `http://localhost:3000` (not a wildcard) when unset, so a missing `CORS_ORIGIN` in production fails safe — it blocks the real frontend (loudly, obviously broken) rather than failing open (silently allowing any origin). **Production deployment must set `CORS_ORIGIN` to the exact deployed frontend domain** — see [DEPLOYMENT.md](./DEPLOYMENT.md).

Confirmed live: a disallowed `Origin` gets back a response whose `Access-Control-Allow-Origin` doesn't match its own origin, which is what causes browsers to block the response from being read by that origin's JavaScript (the standard mechanism this middleware relies on — the server doesn't refuse the request outright, the browser enforces the mismatch).

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
- Stricter rate limit than the public endpoint — **done and confirmed live.** 3 req / 10 min / IP (`PRIVATE_CONTENT_RATE_LIMIT` in `apps/api/src/constants/rateLimit.ts`), a genuinely separate `express-rate-limit` instance (`privateContentRateLimiter`, via a `createRateLimiter()` factory) from the public endpoint's 10/10min — tripping one's budget confirmed live not to affect the other's.
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

If revisited, only irreversible hashing (e.g. bcrypt) is acceptable, and only for ReelSaveHub's own authentication — never for storing third-party (Instagram) credentials in recoverable form.

## Threat model summary

| Risk | Mitigation |
|---|---|
| Instagram upstream DOM changes | Multi-tier fallback scraper pipeline, decoupled via standardized JSON interface |
| CDN IP rate blocking (429s) | Rotating proxy pools for outgoing scrape requests |
| Legal / copyright exposure | No media stored on servers, prominent fair-use disclaimer, Terms of Service page |
| Private account credential misuse | Session-cookie-only approach, no persistent storage, strict server-side ownership checks |
