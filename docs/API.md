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

Sets `Content-Disposition: attachment` to force download instead of inline playback. Media is never written to disk on the server.

## Frontend state machine

`IDLE -> VALIDATING -> FETCHING -> SUCCESS | ERROR | RATE_LIMITED`

## Implementation status

Routes, controllers, validators, and the error envelope are fully wired and confirmed working end-to-end via `curl` — both a Zod validation failure (`INVALID_URL`) and the stubbed `scraperService` throwing (`SERVER_ERROR`) return the correct response shape. The scraper and download services (`apps/api/src/services`) themselves are still stubs — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for why `scraperService.extractMedia` is currently blocked.
