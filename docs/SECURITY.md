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
