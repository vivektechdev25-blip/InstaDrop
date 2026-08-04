# Features

## MVP scope (5-day target)

- [x] Single photo/video/reel URL parsing — confirmed live against real posts; carousel parsing implemented but unverified, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [x] Direct CDN link retrieval — `GET /api/v1/download` confirmed live for both image and video, correct headers and complete valid files
- [ ] Media preview player
- [x] Responsive dark/light UI
- [ ] Serverless edge API
- [x] Rate limiting (in-memory `express-rate-limit` for MVP — see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting-in-memory-for-mvp))
- [ ] Complete SEO setup

## Explicitly out of MVP scope (post-MVP roadmap)

- Stories / Highlights parser
- Profile bulk downloader
- Browser extension
- User search history
- Enterprise REST API
- Private account support (own content only — see [SECURITY.md](./SECURITY.md))

See [ROADMAP.md](./ROADMAP.md) for phasing and [TODO.md](./TODO.md) for active tasks.
