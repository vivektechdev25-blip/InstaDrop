# API

Base URL: `/api/v1`

All responses use a consistent envelope. Error responses additionally carry a machine-readable `code` (`INVALID_URL`, `PRIVATE_ACCOUNT`, `RATE_LIMITED`, `SERVER_ERROR`) so the frontend can branch without string-matching `message`:

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

## `GET /api/v1/download`

Binary streaming, proxies the media file straight to the browser.

**Query params:** `url` (encoded CDN URL), `filename` (suggested download filename)

Sets `Content-Disposition: attachment` to force download instead of inline playback. Media is streamed directly from the upstream CDN response to the client response — never written to disk or buffered fully in memory on the server.

**Security:** `url` is restricted to `*.cdninstagram.com` / `*.fbcdn.net` hostnames (enforced in `downloadMediaSchema.ts`) — without this, the endpoint would be an open proxy for arbitrary URLs (SSRF risk). A non-Instagram-CDN URL returns `400 INVALID_URL`.

## Frontend state machine

`IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED`

## Implementation status

`POST /api/v1/fetch` is fully implemented and confirmed live end-to-end: real public image post, real public reel (video), a nonexistent-shortcode `INVALID_URL` case, and Zod request validation all return the correct response shape and real data where applicable. `PRIVATE_ACCOUNT` detection is implemented but not live-verified — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). Carousel posts currently return image-only slides (video-in-carousel and the click-through slide collection itself are unverified against a real carousel).

`GET /api/v1/download` is fully implemented and confirmed live end-to-end: real image and real video (reel) downloads both return correct `Content-Type`/`Content-Disposition`/`Content-Length` and produce valid, complete files (verified with `file` — correct JPEG/MP4 signatures, matching byte sizes). The SSRF guard was also confirmed live: a non-Instagram-CDN URL is rejected with `400 INVALID_URL` before any upstream request is made.
