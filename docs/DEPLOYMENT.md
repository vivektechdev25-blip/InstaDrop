# Deployment

## Environments

| App | Host | How it builds |
|---|---|---|
| `apps/web` | **Netlify** | pnpm workspace build from the repo root, Next.js via Netlify's OpenNext adapter |
| `apps/api` | **Railway** | Docker (`apps/api/Dockerfile`), declared in `railway.json` |
| Postgres (Supabase) | — | **Not used.** Request logging is scaffolded but not wired in; see [DATABASE.md](./DATABASE.md) |

History: the docs previously described Vercel (frontend) and Render (API, switched from Railway on 2026-08-18). The confirmed setup as of 2026-10-14 is Netlify + Railway. `render.yaml` is still in the repo but **unused** — kept only because removing deploy config is the owner's call, and recommended for removal. Nothing in the code is host-specific: the same Dockerfile runs on any container host.

## Frontend — Netlify

### Settings

Verified against Netlify's own docs on 2026-10-14 ([monorepos](https://docs.netlify.com/build/configure-builds/monorepos/), [dependencies](https://docs.netlify.com/configure-builds/manage-dependencies/), [Next.js](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)). There is **no committed `netlify.toml`** — the live site runs on dashboard settings, and a committed file would override them on the next deploy. A reviewed proposal lives at [`docs/deploy/netlify.toml.proposed`](./deploy/netlify.toml.proposed).

| Setting | Value | Why |
|---|---|---|
| Base directory | *(empty — repo root)* | Netlify runs `pnpm install` when the base directory contains `pnpm-lock.yaml`; it's at the root, and a workspace install from the root is what resolves `@reelsavenow/types`. |
| Package directory | `apps/web` | Netlify's monorepo setting for "where the site lives"; UI-only. |
| Build command | `pnpm --filter @reelsavenow/web... build` | The trailing `...` builds `packages/types` first. Verified locally from the repo root. |
| Publish directory | *(handled by the Next.js adapter)* | Netlify applies `@netlify/plugin-nextjs` automatically for Next.js ≥ 13.5 and recommends not pinning it. |
| Node version | `NODE_VERSION=20` | Matches `engines`, CI and the Docker image's target. |
| pnpm version | from `packageManager` (`pnpm@9.0.0`) | Read by Corepack; nothing to set. |

**Lockfiles:** pnpm is the only package manager. The root `package-lock.json` was removed on 2026-10-14 after confirming no deployment could depend on it: it listed zero dependencies, `npm install` from it installed nothing, and npm can't install `apps/web` at all (`EUNSUPPORTEDPROTOCOL workspace:*`). Netlify's docs don't define precedence when both lockfiles exist, so its presence was pure ambiguity.

### Environment variables (build time)

`NEXT_PUBLIC_*` values are **inlined into the client JavaScript at build time** (verified: the value appears in `.next/static` chunks). They must be set in Netlify's environment before the build, and changing one needs a redeploy. Never put a secret in a `NEXT_PUBLIC_*` variable — nothing else is read by the frontend.

| Var | Value | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://<railway-api-domain>/api/v1` | Where the browser sends `/fetch`, `/private/fetch` and `/download`. **A production build fails if this is missing or points at localhost** — see below. |
| `NEXT_PUBLIC_SITE_URL` | `https://<netlify-production-domain>` (or the custom domain) | Canonical URLs, sitemap, OG tags. |
| `PNPM_FLAGS` | `--shamefully-hoist` — **only if** the build fails with module-resolution errors | Documented by Netlify for Next.js + pnpm; not needed by the local build. |

**The build enforces this variable (2026-10-15).** `next build` stops with an actionable error unless `NEXT_PUBLIC_API_BASE_URL` is set to an absolute, non-local http(s) URL. Before that guard existed, a missing variable produced a successful build whose every request went to `http://localhost:4000` — which is exactly what shipped to production on 2026-10-14 (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). If a Netlify deploy now fails with that message, the variable is missing from **that site**, in the **Production** context, with **Builds** among its scopes.

**Deploy previews** are built with the same `NEXT_PUBLIC_API_BASE_URL` but are **not** in the API's CORS allowlist, by design — previews can't call the production API. If previews need a working backend, give them their own API (and their own `CORS_ORIGIN`), rather than widening production CORS to `*.netlify.app`.

## API — Railway

### Settings

From `railway.json`: builder `DOCKERFILE`, `dockerfilePath: apps/api/Dockerfile`, health check `/health` (300s timeout), restart `ON_FAILURE` ×3. The start command is the image's `CMD` (`node dist/server.js`) — `railway.json` doesn't override it.

Check in the Railway dashboard:
- **Root directory: empty (repo root).** The Dockerfile's `deps` stage copies `packages/types` and root `config/`; a narrower build context fails with `path does not exist: tsconfig.json` (a bug already hit and fixed locally — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)).
- No custom start command overriding `CMD`. If one was set before 2026-10-14 it may still say `node dist/app.js`, which no longer starts the server — the entry point moved to `dist/server.js` (`app.ts` now only builds the Express app, so it can be tested in-process).

### Environment variables (runtime)

| Var | Required? | Notes |
|---|---|---|
| `PORT` | Set by Railway | Validated at startup (integer 1–65535) — a malformed value used to become `NaN`, which Node treats as "any free port". Defaults to `4000`. The server binds `0.0.0.0`; a loopback-only bind is unreachable from outside the container. |
| `CORS_ORIGIN` | **Yes** | Comma-separated **exact** origins, e.g. `https://<netlify-production-domain>,https://<custom-domain>`. Validated at startup: a trailing slash, path, mixed-case host or `*` fails the boot with the exact value to use, instead of silently never matching the browser's `Origin` header. Unset → `http://localhost:3000` (fails safe, never a wildcard). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **No** | Only read by `requestLogRepository.ts`, which nothing imports. Don't set them. |

### Chromium in the container

- Base image `mcr.microsoft.com/playwright:v1.62.1-jammy` ships Chromium and its OS libraries. Its tag **must** match the `playwright` version pinned in `apps/api/package.json`, or the browser binary won't match what the npm package expects.
- Launch flags `--disable-dev-shm-usage` (containers mount `/dev/shm` at 64MB, which Chromium exhausts on an image-heavy page) and `--no-sandbox` (the image runs as root). The `--no-sandbox` justification depends on only ever navigating to Instagram — see the URL-validation tests.
- **Concurrency cap:** at most 2 browser contexts at once, 8 queued, `503` beyond (`browserManager.ts`). The browser un-caches itself when it dies, so an OOM-killed Chromium no longer leaves a healthy-looking but permanently broken service.
- **Memory:** see the measured figure in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (container run, 2026-10-14) before choosing a Railway plan. If the service restarts under real use, that's the memory ceiling.

### `trust proxy`

`app.set("trust proxy", 1)` trusts exactly one proxy hop — correct on Render (confirmed live then). **Not yet verified on Railway.** It decides which IP the rate limiter counts: too few hops and every client shares the proxy's IP (one user can rate-limit everyone); too many and a client can spoof `X-Forwarded-For`. To verify after deploy: hit `/api/v1/fetch` from two different networks and confirm each gets its own `RateLimit-Remaining` count.

## Deployment order

`CORS_ORIGIN` (API) needs the frontend's origin; `NEXT_PUBLIC_API_BASE_URL` (frontend) needs the API's URL.

1. Deploy the API to Railway and note its public domain.
2. Set `NEXT_PUBLIC_API_BASE_URL` on Netlify to `https://<railway-api-domain>/api/v1` and deploy the frontend.
3. Set `CORS_ORIGIN` on Railway to the Netlify production origin (plus any custom domain) and redeploy the API.
4. Adding a custom domain later means repeating step 3 — and, for the frontend's own domain, updating `NEXT_PUBLIC_SITE_URL` and redeploying.

## Building and checking locally

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build

docker build -f apps/api/Dockerfile -t reelsavenow-api .
docker run --rm -p 4000:4000 -e CORS_ORIGIN=http://localhost:3000 reelsavenow-api
curl -s localhost:4000/health
```

The build context must be the repo root. CI (`.github/workflows/ci.yml`) runs all of the above except `docker run`.

## Pre-production checklist

- [ ] Railway: root directory empty, no start-command override, `CORS_ORIGIN` set to the exact Netlify origin(s)
- [ ] Netlify: base directory empty, package directory `apps/web`, build command as above, `NODE_VERSION=20`, both `NEXT_PUBLIC_*` vars set
- [ ] After deploy: `/health` returns `{"status":"ok"}`; the frontend can fetch a real post (CORS + API URL agree)
- [ ] After deploy: `trust proxy` verified (see above)
- [x] Rate limiting: three independent budgets, covered by automated tests
- [x] No secrets committed; no secret in any `NEXT_PUBLIC_*` variable
- [x] Session-cookie handling audited — cookie scoped to one browser context, never logged (redacted even from library errors), never echoed; covered by automated tests

## Costs

The earlier cost table priced Vercel + Render + Supabase and no longer applies. It hasn't been re-derived for Netlify + Railway — check current pricing for both; the main variable is the Railway memory needed for Chromium.
