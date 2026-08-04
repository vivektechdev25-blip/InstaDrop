# SEO

SEO is built in from day one, not an afterthought.

## Requirements

- Metadata (title/description) per page via Next.js `Metadata` API — see `apps/web/src/app/layout.tsx`
- OpenGraph and Twitter Card tags
- Canonical URLs
- `robots.txt` — see `apps/web/public/robots.txt`
- `sitemap.xml` (generated at build time — pending Day 4 implementation)
- JSON-LD structured data using the `WebApplication` schema
- PWA manifest — see `apps/web/public/manifest.json`

## Targets

- Lighthouse SEO/Performance score > 95
- LCP < 1.5s, FID < 100ms, CLS < 0.05 (see [ARCHITECTURE.md](./ARCHITECTURE.md) for how this is achieved)

## Status

Base metadata and robots.txt/manifest scaffolding are in place. JSON-LD, sitemap generation, and OG image generation are pending Day 4 of the [ROADMAP](./ROADMAP.md).
