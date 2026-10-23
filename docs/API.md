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

**Rate limited (429)**: 10 requests / 10 minutes / IP, enforced via `express-rate-limit` (in-memory).

**Busy (503)**: this applies to `/fetch` and `/private/fetch` alike. Both share one Chromium pool capped at 2 active browser contexts with 8 more requests queued. Beyond that, the API answers immediately with `"We're handling too many requests right now. Please try again in a moment."`, code `SERVER_ERROR`, rather than queueing work that would outlive the frontend's 30s timeout.

**Extraction tiers**: Tier 1 (`instagram-url-direct`) is currently refused by Instagram (401). After the first refusal a circuit breaker skips it for 15 minutes, so in practice every extraction is served by Tier 2 (a real browser render, ~3.5–5 s warm). See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

## Errors common to every endpoint

- **Malformed JSON body (400) / oversized body (413):** the standard envelope with `code: "INVALID_URL"` (the existing invalid-request code) and a static message. The raw body is never echoed back or logged. Before 2026-10-14 these were 500s, and the logs contained the raw body.
- **Unexpected failures (500):** `"Something went wrong. Please try again."`, code `SERVER_ERROR`. No stack trace or internal detail reaches the client.

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

**Query params:**

- `url` — encoded CDN URL.
- `filename` — suggested download filename.
- `audio` (optional) — a separate audio-only stream for a video-only `url`; the two are joined into one MP4.
- `format` (optional) — `mp3` is the only accepted value; anything else is `400 INVALID_URL`.

Sets `Content-Disposition: attachment` to force download instead of inline playback. A plain download is streamed directly from the upstream CDN response to the client response, never written to disk or buffered fully in memory on the server. A join, or an MP3, is assembled in a private temp folder that is always removed afterwards, on success, error, timeout and client disconnect.

**`format=mp3` — the sound only.**

- **Source:** `audio` when given, otherwise `url`. Both are under the same allowlist, limits and timeouts as any download.
- **Check before converting:** the file's own track list decides, not its URL's extension. No audio track gives `422 NO_AUDIO` ("This reel has no audio to download."), without running ffmpeg. This is what a reel Instagram has muted, or one whose creator removed the sound, gets.
- **Conversion:** a re-encode with ffmpeg and libmp3lame at 192kbps. Instagram's audio is AAC, so an MP3 is never a plain copy.
- **Response:** `Content-Type: audio/mpeg`, an exact `Content-Length`, and the filename's extension replaced by `.mp3`.
- **Failures:** if ffmpeg fails or times out (`DOWNLOAD_MUX_TIMEOUT_MS`), or its output has no audio frames, the answer is `502` and nothing is sent.
- **Capacity:** at most `AUDIO_TRANSCODE_MAX_CONCURRENCY` conversions at once (default 2); beyond that, `503`.

**Security:** `url` must be **https** on a `*.cdninstagram.com` / `*.fbcdn.net` host. This is enforced twice, by one shared allowlist (`apps/api/src/constants/allowedCdnHosts.ts`): once by `downloadMediaSchema.ts` on the caller-supplied URL before any request is made, and again per redirect hop in `downloadService.ts`, which requests with `redirect: "manual"` so a validated URL can't 302 off the allowlist (max 5 hops). Without this the endpoint would be an open proxy for arbitrary URLs (SSRF risk). A non-Instagram-CDN URL returns `400 INVALID_URL`.

**Timeouts:** 15s to receive response headers; the body stream is deliberately uncapped, since a real reel is tens of megabytes. A client that disconnects mid-download tears the upstream stream down with it.

**Rate limited (429)** — 60 requests / 10 minutes / IP, its own `express-rate-limit` instance, independent of `/fetch`'s 10/10min budget. Before 2026-10-14 both endpoints shared one counter, so a fetch plus the slides of a carousel could trip the limit partway through a user's own download. Confirmed live via each endpoint's own `RateLimit-Policy` header.

**Error responses are JSON envelopes, not media.** A client that saves the response body without checking `response.ok` writes that envelope to disk as a `.mp4`/`.jpg` — which is exactly the bug fixed in `PreviewCard.tsx` on 2026-10-14.

## Frontend state machine

Public flow: `IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED`

Own-private-content flow (`usePrivateContentFetch.ts`) — a separate, parallel state machine, not a shared one: `IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED | SESSION_EXPIRED | ACCESS_DENIED`

## Implementation status

`POST /api/v1/fetch` is fully implemented and confirmed live end-to-end: real public image post, real public reel (video), a nonexistent-shortcode `INVALID_URL` case, and Zod request validation all return the correct response shape and real data where applicable. `PRIVATE_ACCOUNT` detection is implemented but not live-verified — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). Carousel posts currently return image-only slides (video-in-carousel and the click-through slide collection itself are unverified against a real carousel).

`GET /api/v1/download` is fully implemented and confirmed live end-to-end: real image and real video (reel) downloads both return correct `Content-Type`/`Content-Disposition`/`Content-Length` and produce valid, complete files (verified with `file` — correct JPEG/MP4 signatures, matching byte sizes). The SSRF guard was also confirmed live: a non-Instagram-CDN URL is rejected with `400 INVALID_URL` before any upstream request is made.

`POST /api/v1/private/fetch` is implemented and **partially** live-verified. Confirmed live: request validation for both fields (missing/malformed `sessionCookie`, malformed `url`), the separate 3-req/10min rate limiter tripping independently of the public endpoint's own budget, that a Zod validation failure never echoes the submitted cookie value back in the response, and — sending a well-formed-but-fake `sessionCookie` against a real reel URL — a genuine `401 SESSION_EXPIRED` response, confirming the login-redirect detection path actually fires end-to-end against real Instagram. **Not live-verified:** the actual authenticated happy path (successful ownership match) and the `ACCESS_DENIED` ownership-mismatch case specifically — both require a real, currently-valid session cookie from an account the tester controls, which this project has no way to create or access in this environment (the same structural limitation as the long-standing private-account-detection gap — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). See [ARCHITECTURE.md](./ARCHITECTURE.md#own-private-content-flow-session-cookie-authenticated) for exactly which parts of the extraction logic are still flagged as unverified and why.
