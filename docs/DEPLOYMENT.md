# Deployment

## Environments

| App | Host | Notes |
|---|---|---|
| `apps/web` | Vercel | Hobby tier for MVP, Pro at scale |
| `apps/api` | Render | Dockerized (`apps/api/Dockerfile`), declared in `render.yaml`. Starter instance for MVP — see the Chromium memory note below |
| Postgres | Supabase | Free tier for MVP — **not currently required to deploy**, see below |

Switched from Railway to Render on 2026-08-18. Nothing in the code was Railway-specific; both are Docker-based container hosts and the same `apps/api/Dockerfile` deploys unchanged to either.

## The API must run as a Docker service, not a Node service

Non-negotiable, and the single easiest thing to get wrong: Render's dashboard defaults a new service to the **Node** runtime, which is wrong for this API in two separate ways.

1. It builds the whole monorepo (`pnpm -r build`, including `apps/web`), then runs `pnpm run start` at the repo root — where **no `start` script exists**. The deploy fails with `ERR_PNPM_NO_SCRIPT_OR_SERVER`.
2. More fundamentally, the Node runtime has no Chromium and no root access to install its system libraries. Playwright — the entire Tier 2 scraper — cannot run there. A service that boots this way is still broken: Tier 1 answers some requests, and everything that needs a real browser fails.

`render.yaml` at the repo root exists to remove this choice from the deploy flow. Deploy via **New → Blueprint**, not New → Web Service, and Render reads the runtime, Dockerfile path, build context, health check, and instance type from it.

If configuring by hand anyway, the settings are: runtime `Docker`, Dockerfile path `apps/api/Dockerfile`, Docker build context `.` (repo root — see the build-context note further down), Root Directory empty.

## Environment variables

Every env var the code actually reads, audited live against both `.env.example` files (2026-08-04) — not assumed from the file alone:

**`apps/api`** (reads `process.env.PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`):
| Var | Required to deploy? | Notes |
|---|---|---|
| `PORT` | No | Render sets this automatically; the app reads it and falls back to `4000`. The server binds explicitly to `0.0.0.0` — a process bound only to loopback is unreachable from outside the container, and the failure mode is a health check that never passes while the logs look healthy. |
| `CORS_ORIGIN` | **Yes, for production** | `app.ts` defaults to `http://localhost:3000` if unset — safe for nothing-leaks-open, but it means the real deployed frontend won't be able to call the API until this is set to its actual production URL. See [SECURITY.md](./SECURITY.md#cors) — this was found to be a real bug (documented but silently unused) and fixed while preparing this checklist. **Accepts a comma-separated list**, since one frontend legitimately has several origins (`*.vercel.app` plus a custom domain): `https://reelsavehub.vercel.app,https://reelsavehub.com`. Confirmed live that each listed origin is echoed back and an unlisted one is rejected. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **No, not yet** | `requestLogRepository.ts` (the only file that reads these) is not imported anywhere in the running app yet — request logging is scaffolded but not wired into the live request path. The API deploys and functions fully without these set. Needed once request logging actually ships. |

**`apps/web`** (reads `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`):
| Var | Required to deploy? | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** | Must point at the deployed `apps/api` URL + `/api/v1`. Only known after the backend is deployed — see the ordering note below. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Drives canonical URLs, sitemap, OG tags ([SEO.md](./SEO.md)). Set to the real production frontend domain once known. |

**No secrets committed:** confirmed live 2026-08-04 — `git log --all` searched for any committed `.env` file or `.env`-pattern content; none found ([CHANGELOG.md](./CHANGELOG.md)).

Never commit real `.env` files — they are gitignored.

## Deployment order (breaks a circular dependency)

`CORS_ORIGIN` (backend) needs the frontend's URL; `NEXT_PUBLIC_API_BASE_URL` (frontend) needs the backend's URL. Neither is known until the other is deployed at least once:

1. Deploy `apps/api` to Render first (Render assigns a `*.onrender.com` URL immediately on first deploy, before any custom domain).
2. Deploy `apps/web` to Vercel with `NEXT_PUBLIC_API_BASE_URL` set to that Render URL + `/api/v1`.
3. Go back to the Render service and set `CORS_ORIGIN` to the Vercel URL Vercel just assigned (`*.vercel.app`, or the custom domain if one's attached), then redeploy/restart the API service so the new env var takes effect.
4. If a custom domain is added later to either service, repeat step 3 with the new domain.

## Platform setup (dashboard settings, since this monorepo needs a couple of non-default values)

**Vercel project settings for `apps/web`:**
- Root Directory: `apps/web`
- Framework Preset: Next.js (auto-detected)
- Build/Install commands: Vercel's default pnpm-workspace detection should work once Root Directory is set; override only if the initial deploy fails.
- Environment variables: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL` (see table above).

**Render service settings for `apps/api`:** all of these come from `render.yaml` automatically when deploying via **New → Blueprint**. Listed here for reference, and for anyone configuring the service by hand:
- Runtime: **Docker** (not Node — see the section near the top of this doc for why that choice is load-bearing, not cosmetic).
- Dockerfile path: `apps/api/Dockerfile`
- Build context: **repo root** (`.`), not `apps/api/` — the Dockerfile's `deps` stage copies `packages/types` and root `config/` (needed for `packages/types`' own build step, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). Getting this wrong reproduces bugs already found and fixed locally.
- Root Directory: **empty**. Setting it to `apps/api` also narrows the build context and reintroduces the failure above.
- Health check path: `/health` — a dependency-free endpoint that touches no browser and no network, so it still answers instantly while a scrape is occupying the worker.
- Port: injected by Render via `PORT` and read by `app.ts`; the server binds to `0.0.0.0` so it's reachable from outside the container.
- Environment variables: `CORS_ORIGIN` at minimum (see table above; step 3 in the ordering above for its actual value).

**Instance sizing — Chromium is the constraint.** The API launches a real headless browser per request context, on top of Node. Render's free instance boots the API fine but tends to get Chromium OOM-killed mid-scrape, and free instances sleep after ~15 minutes idle, turning the next request into a roughly one-minute cold start. `render.yaml` therefore declares `plan: starter`; drop it to `free` only to prove the build works, then move back up before sharing the URL with anyone. If the service restarts on its own under real use, that's the memory ceiling — go up one tier.

**Container-safe Chromium flags.** `browserManager.ts` launches with `--disable-dev-shm-usage` and `--no-sandbox`. Both exist specifically for containerized hosting: container runtimes mount `/dev/shm` at 64MB, which Chromium exhausts partway through a real image-heavy Instagram page, and the image runs as root, under which Chromium's setuid sandbox refuses to start. They're applied unconditionally rather than gated on an env check — conditionally-applied launch flags are exactly the kind of thing that works locally and fails only in production.

## Building the API image locally

```bash
docker build -f apps/api/Dockerfile -t reelsavehub-api:test .
docker run --rm -p 4000:4000 reelsavehub-api:test
```

Build context must be the repo root (not `apps/api/`) — the Dockerfile copies `packages/types` and root `config/` into its `deps` stage. Confirmed working locally 2026-08-04, including a real request through the running container (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for the bugs that surfaced getting here).

## What's blocking an actual deploy right now

Nothing in the code. As of 2026-08-18 the repo is pushed to GitHub, `render.yaml` declares the API service, and the container-hosting fixes below are in place and verified locally.

The remaining steps need account access this environment doesn't have — no Vercel CLI, no Render CLI, no auth tokens for either (checked live, not assumed) — so they're done through the two dashboards by hand, in the order given above.

### Deployment-readiness fixes applied 2026-08-18

Found by auditing the code specifically for container-hosting failure modes, and each verified against a real running build rather than reasoned about:

| Fix | Why it would have broken in production |
|---|---|
| Chromium `--disable-dev-shm-usage` / `--no-sandbox` | Default 64MB `/dev/shm` and root-user sandbox refusal both crash Chromium **only** inside a container — local dev never reproduces either. Verified a real Instagram reel still scrapes end-to-end with the flags applied. |
| `/health` endpoint | No route answered a bare `GET`, so there was nothing for a platform health check to poll and no safe URL to open in a browser to confirm a deploy worked. |
| Explicit `0.0.0.0` bind | A process bound only to loopback is unreachable from outside its container; the failure mode is a health check that never passes while the logs look perfectly healthy. |
| Comma-separated `CORS_ORIGIN` | A deployed frontend has at least two legitimate origins (`*.vercel.app` and a custom domain). Single-value parsing forced a redeploy to switch between them. Verified live: each listed origin is echoed back, an unlisted one is rejected. |
| `render.yaml` | Removes the Node-vs-Docker runtime choice from the deploy flow entirely — the mistake that produces `ERR_PNPM_NO_SCRIPT_OR_SERVER` and, worse, a Chromium-less API. |

## Pre-production readiness checklist

- [ ] All environment variables populated on Vercel & Render — see the tables above for exactly which ones matter
- [ ] CORS domains locked strictly to production domain — code fixed and verified locally (see [SECURITY.md](./SECURITY.md#cors)); setting the real production value is the last step in the deployment order above
- [x] Rate limiting verified active via load testing — confirmed live locally (12 rapid requests, first 10 pass, 11+ get `429`), see [TESTING.md](./TESTING.md). Re-verify once more on the deployed URL as part of the post-deploy smoke test.
- [x] Lighthouse SEO/Performance score audited above 95 — Performance 99, Accessibility 100, Best Practices 100, SEO 100, see [TESTING.md](./TESTING.md#lighthouse-audit-2026-08-04)
- [ ] Legal static pages (Privacy, Terms, Contact) active — content written and confirmed rendering correctly in a local production build ([TODO.md](./TODO.md)); this item tracks them being live on the deployed domain
- [ ] Documentation files complete and current
- [x] No secrets committed to git history — confirmed live, see above
- [ ] Session-cookie handling audited (if private account feature shipped) — not shipped, not applicable yet

## Cost projections

| Resource | MVP (0–10k MAU) | Scaled (100k+ MAU) |
|---|---|---|
| Vercel (frontend) | $0/mo (Hobby) | $20/mo (Pro) |
| Render (backend) | $5/mo (Starter) | $35/mo (Scaled containers) |
| Supabase | $0/mo (Free tier) | $25/mo (Pro tier) |
| Domain | $1/mo | $1/mo |
| **Total** | **~$6/month** | **~$81/month** |
