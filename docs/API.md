# API

Base URL: `/api/v1`

All responses use a consistent envelope. Error responses additionally carry a machine-readable `code` (`INVALID_URL`, `PRIVATE_ACCOUNT`, `RATE_LIMITED`, `SERVER_ERROR`, `SESSION_EXPIRED`, `ACCESS_DENIED` — the last two are own-private-content-flow only, see below) so the frontend can branch without string-matching `message`:

```json
{
  "success": true,
  "message": "Media retrieved successfully.",
  "data": {},
  "errors": null
}
```

## `POST /api/v1/fetch`

Media extraction from a public Instagram URL.

**Request**
```json
{ "url": "https://www.instagram.com/reel/C123456789/" }
```

**Success (200)**
```json
{
  "success": true,
  "data": {
    "id": "C123456789",
    "shortcode": "C123456789",
    "caption": "Sample post caption snippet...",
    "author": { "username": "creator_handle", "full_name": "Creator Name" },
    "media": [{
      "type": "video",
      "url": "https://scontent.cdninstagram.com/...",
      "thumbnail": "https://scontent.cdninstagram.com/...",
      "dimensions": { "width": 1080, "height": 1920 }
    }]
  }
}
```

**Private account (403)**
```json
{
  "success": false,
  "message": "This content is from a private Instagram account and cannot be processed.",
  "data": null,
  "errors": null,
  "code": "PRIVATE_ACCOUNT"
}
```

**Rate limited (429)** — 10 requests / 10 minutes / IP, enforced via `express-rate-limit` (in-memory).

## `POST /api/v1/private/fetch`

Own-private-content flow (2026-08-05) — separate endpoint from `/fetch`, not a modification of it. Authenticates with a session cookie from the requester's own logged-in Instagram session and fetches their own Reels/posts. Scope: Reels + Posts only, no Stories (see [ARCHITECTURE.md](./ARCHITECTURE.md#own-private-content-flow-session-cookie-authenticated)).

**Request**
```json
{
  "sessionCookie": "<the requester's own Instagram sessionid cookie value>",
  "url": "https://www.instagram.com/reel/C123456789/"
}
```

**Success (200):** identical shape to `POST /api/v1/fetch`'s success response (same `InstagramPost` DTO) — the frontend renders both through the same `PreviewCard` component, and downloads go through the same, unmodified `GET /api/v1/download`.

**Session expired/invalid (401)**
```json
{
  "success": false,
  "message": "Your session has expired. Please copy a fresh session cookie and try again.",
  "data": null,
  "errors": null,
  "code": "SESSION_EXPIRED"
}
```

**Ownership mismatch (403)**
```json
{
  "success": false,
  "message": "This content doesn't belong to the account you're signed in as.",
  "data": null,
  "errors": null,
  "code": "ACCESS_DENIED"
}
```
Fails closed: if the requested content's owner can't be determined at all (not just if it's determined and doesn't match), this is the response — never treated as a pass. See [ARCHITECTURE.md](./ARCHITECTURE.md#own-private-content-flow-session-cookie-authenticated) for why this specific check is flagged as unverified pending real testing.

**Rate limited (429)** — 3 requests / 10 minutes / IP, a separate, stricter `express-rate-limit` instance from the public endpoint's 10/10min (confirmed live: exhausting this endpoint's budget does not affect `/fetch`'s, and vice versa — two independent counters, not shared state).

**Session cookie handling:** in-memory only, scoped to a single Playwright browser context that's created and closed within one request (`context.close()` in a `finally` block) — never written to a database, log, or cache at any point. Confirmed live: Zod's validation-error responses for a malformed cookie return only the validation message ("That doesn't look like a full session cookie value."), never the submitted value itself.

## `GET /api/v1/download`

Binary streaming, proxies the media file straight to the browser.

**Query params:** `url` (encoded CDN URL), `filename` (suggested download filename)

Sets `Content-Disposition: attachment` to force download instead of inline playback. Media is streamed directly from the upstream CDN response to the client response — never written to disk or buffered fully in memory on the server.

**Security:** `url` is restricted to `*.cdninstagram.com` / `*.fbcdn.net` hostnames (enforced in `downloadMediaSchema.ts`) — without this, the endpoint would be an open proxy for arbitrary URLs (SSRF risk). A non-Instagram-CDN URL returns `400 INVALID_URL`.

## Frontend state machine

Public flow: `IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED`

Own-private-content flow (`usePrivateContentFetch.ts`) — a separate, parallel state machine, not a shared one: `IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED | SESSION_EXPIRED | ACCESS_DENIED`

## Implementation status

`POST /api/v1/fetch` is fully implemented and confirmed live end-to-end: real public image post, real public reel (video), a nonexistent-shortcode `INVALID_URL` case, and Zod request validation all return the correct response shape and real data where applicable. `PRIVATE_ACCOUNT` detection is implemented but not live-verified — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). Carousel posts currently return image-only slides (video-in-carousel and the click-through slide collection itself are unverified against a real carousel).

`GET /api/v1/download` is fully implemented and confirmed live end-to-end: real image and real video (reel) downloads both return correct `Content-Type`/`Content-Disposition`/`Content-Length` and produce valid, complete files (verified with `file` — correct JPEG/MP4 signatures, matching byte sizes). The SSRF guard was also confirmed live: a non-Instagram-CDN URL is rejected with `400 INVALID_URL` before any upstream request is made.

`POST /api/v1/private/fetch` is implemented and **partially** live-verified. Confirmed live: request validation for both fields (missing/malformed `sessionCookie`, malformed `url`), the separate 3-req/10min rate limiter tripping independently of the public endpoint's own budget, that a Zod validation failure never echoes the submitted cookie value back in the response, and — sending a well-formed-but-fake `sessionCookie` against a real reel URL — a genuine `401 SESSION_EXPIRED` response, confirming the login-redirect detection path actually fires end-to-end against real Instagram. **Not live-verified:** the actual authenticated happy path (successful ownership match) and the `ACCESS_DENIED` ownership-mismatch case specifically — both require a real, currently-valid session cookie from an account the tester controls, which this project has no way to create or access in this environment (the same structural limitation as the long-standing private-account-detection gap — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). See [ARCHITECTURE.md](./ARCHITECTURE.md#own-private-content-flow-session-cookie-authenticated) for exactly which parts of the extraction logic are still flagged as unverified and why.
