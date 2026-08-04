# SEO

SEO is built in from day one, not an afterthought.

## Requirements

- Metadata (title/description) per page via Next.js `Metadata` API — see `apps/web/src/app/layout.tsx`
- OpenGraph and Twitter Card tags
- Canonical URLs
- `robots.txt` — generated dynamically via `apps/web/src/app/robots.ts` (Next.js file convention), not a static file, so it always agrees with `siteConfig.url`
- `sitemap.xml` — generated via `apps/web/src/app/sitemap.ts`
- JSON-LD structured data using the `WebApplication` schema — see `apps/web/src/app/layout.tsx`
- OG image — auto-generated via `apps/web/src/app/opengraph-image.tsx` (Next.js `next/og` convention); Next.js wires the `og:image`/`twitter:image` meta tags to it automatically
- PWA manifest — see `apps/web/public/manifest.json`

## Site config

`apps/web/src/lib/siteConfig.ts` is the single source of truth for the site's canonical URL (`NEXT_PUBLIC_SITE_URL`, defaults to `https://instadrop.app`), name, and description — reused by `layout.tsx`, `sitemap.ts`, and `robots.ts` so they can't drift out of sync with each other.

## Targets

- Lighthouse SEO/Performance score > 95
- LCP < 1.5s, FID < 100ms, CLS < 0.05 (see [ARCHITECTURE.md](./ARCHITECTURE.md) for how this is achieved)

## Status

Implemented and confirmed live (production build + `next start`, not just typechecking):
- `GET /robots.txt` — correct `Allow: /` + `Sitemap:` pointing at `siteConfig.url`
- `GET /sitemap.xml` — all four routes (home + 3 legal pages) present with correct `<loc>`
- `GET /opengraph-image` — valid 1200x630 PNG (confirmed via `file`)
- Home page `<head>` — canonical `<link>`, full `og:*`/`twitter:*` tags (including the auto-wired image), and valid `WebApplication` JSON-LD, all confirmed present in the actual rendered HTML

Per-page metadata for the legal pages is still generic (inherits the root layout's title/description) — will be filled in alongside their real content ([TODO.md](./TODO.md)).
