# Security

## Global rules (always apply)

- Helmet, CORS, rate limiting, environment variables, input validation, output sanitization, secure headers — always.
- Never expose secrets or API keys.
- Never trust frontend validation — always validate on the backend (Zod schemas in `apps/api/src/validators`).
- Never log sensitive information (cookies, tokens, credentials).
- IP addresses hashed with SHA-256 + a daily rotating salt before storage.

## Rate limiting

Public endpoints: 10 requests / 10 minutes / IP via `express-rate-limit`, in-memory (`apps/api/src/middlewares/rateLimiter.ts`). This is sufficient for the MVP's single-instance Railway deployment.

**Note:** in-memory rate limiting only holds its limit correctly on a single instance. If the API scales horizontally (multiple Railway instances), each instance tracks its own counters, so the effective limit multiplies with instance count. Revisit with a distributed store (e.g. Redis-backed sliding window) before scaling out — see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp) and [TODO.md](./TODO.md).

## Direct URL mode: auto-fetch throttling

`?url=` and the `instadrop.com/<instagram-url>` catch-all route (see [ARCHITECTURE.md](./ARCHITECTURE.md#direct-url-mode-two-entry-points-one-pipeline)) both auto-trigger a fetch without a manual click — the natural throttle a manual paste provides doesn't exist for either. Two entry points instead of one means this matters more, not less: a scripted loop could otherwise hit `?url=X1`, `?url=X2`, ... or `instadrop.com/<url1>`, `instadrop.com/<url2>`, ... with zero human interaction.

Mitigations, each confirmed live rather than assumed:
- **Shared rate limit, no separate budget.** Both entry points call the identical `apiClient.post("/fetch")` used by the manual flow, so they're covered by the same `express-rate-limit` counter (10 req / 10 min / IP) with no code path that could bypass it. Confirmed live: tripped the limiter via direct requests, then verified a fresh request through *each* entry point independently returns the same `RATE_LIMITED` state through the real UI (toast + inline message), not a raw API error.
- **`noindex` on both.** The catch-all route carries static `robots: { index: false }` metadata; the homepage conditionally sets the same via `generateMetadata` only when `?url=` is present (the plain homepage stays indexable). Confirmed live via `curl` against the rendered `<head>`. Without this, an unbounded number of `?url=<post>` / `instadrop.com/<post>` combinations could otherwise be crawled and indexed as distinct pages.
- **No silent fetching.** The auto-triggered fetch goes through the same `VALIDATING → FETCHING → SUCCESS|ERROR` state machine as a manual submission — the same visible loading skeleton, on both entry points, not a background request the user can't see.
- **Garbage catch-all paths fail cleanly.** `[...url]` technically matches any unmatched path (e.g. `instadrop.com/some/random/thing`). This is not special-cased — it flows through the same validator that already rejects malformed input, showing the existing friendly error UI. Confirmed live: `HTTP 200`, no stack trace, no unhandled exception, no console errors.

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

### Post-MVP: private account support (own content only)

Recommended approach: **session cookie, own content only**. Options evaluated:

| Option | Feasibility | Legal | Security | Verdict |
|---|---|---|---|---|
| Instagram Basic Display API | None (deprecated 2024) | N/A | N/A | Dead |
| Instagram Graph API | Limited (Business/Creator only) | Safe | Safe | Too narrow |
| Direct credential collection | High | Illegal (ToS violation) | Dangerous | Never |
| **Session cookie (own content only)** | High | Safe | Safe (if done right) | **Recommended** |

**Workflow:**
1. User clicks "Download My Private Content" (separate, clearly labelled UI flow)
2. User extracts their own Instagram session cookie via guided DevTools instructions
3. User pastes the cookie into a dedicated secure input field
4. Backend authenticates with Instagram using the cookie, verifies identity
5. Backend fetches media **only from the authenticated user's own account** — any attempt to access another account is blocked server-side
6. Media streams directly to the browser — nothing is stored
7. Session cookie is discarded immediately after the request — never logged, cached, or persisted

**Non-negotiable rules:**
- Never store session cookies (in-memory only, per-request)
- HTTPS enforced on all endpoints handling cookies
- Cookies redacted from all logs
- Stricter rate limit than the public endpoint (e.g. 3 req / 10 min / IP)
- Server-side ownership verification on every request — never trust client claims
- Clear user disclosure before first use
- Detect and handle expired sessions with a clear `SESSION_EXPIRED` error

### Explicitly rejected approach

Storing Instagram usernames/passwords in the database — plain text or reversible/decryptable — was proposed and **rejected**:
- A single database breach would compromise every stored Instagram account
- Admin-level decrypt access is itself a massive insider-abuse vector
- Direct violation of Instagram's Terms of Service
- Legal exposure under data protection law (GDPR / IT Act)

If revisited, only irreversible hashing (e.g. bcrypt) is acceptable, and only for Instadrop's own authentication — never for storing third-party (Instagram) credentials in recoverable form.

## Threat model summary

| Risk | Mitigation |
|---|---|
| Instagram upstream DOM changes | Multi-tier fallback scraper pipeline, decoupled via standardized JSON interface |
| CDN IP rate blocking (429s) | Rotating proxy pools for outgoing scrape requests |
| Legal / copyright exposure | No media stored on servers, prominent fair-use disclaimer, Terms of Service page |
| Private account credential misuse | Session-cookie-only approach, no persistent storage, strict server-side ownership checks |
