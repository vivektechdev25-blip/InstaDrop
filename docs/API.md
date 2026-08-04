# API

Base URL: `/api/v1`

All responses use a consistent envelope:

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
  "error": "PRIVATE_ACCOUNT",
  "message": "This content is from a private Instagram account and cannot be processed."
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

Routes and controllers are scaffolded in `apps/api/src/routes` and `apps/api/src/controllers`; the scraper and download services (`apps/api/src/services`) are stubs pending Day 2 implementation.
