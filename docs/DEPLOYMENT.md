# Deployment

## Environments

| App | Host | Notes |
|---|---|---|
| `apps/web` | Vercel | Hobby tier for MVP, Pro at scale |
| `apps/api` | Railway | Dockerized (`apps/api/Dockerfile`), Starter tier for MVP, single instance |
| Postgres | Supabase | Free tier for MVP — **not currently required to deploy**, see below |

## Environment variables

Every env var the code actually reads, audited live against both `.env.example` files (2026-08-04) — not assumed from the file alone:

**`apps/api`** (reads `process.env.PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`):
| Var | Required to deploy? | Notes |
|---|---|---|
| `PORT` | No | Railway sets this automatically; the app already falls back to `4000`. |
| `CORS_ORIGIN` | **Yes, for production** | `apps/app.ts` defaults to `http://localhost:3000` if unset — safe for nothing-leaks-open, but it means the real deployed frontend won't be able to call the API until this is set to its actual production URL. See [SECURITY.md](./SECURITY.md#cors) — this was found to be a real bug (documented but silently unused) and fixed while preparing this checklist. |
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

1. Deploy `apps/api` to Railway first (Railway assigns a `*.up.railway.app` URL immediately on first deploy, before any custom domain).
2. Deploy `apps/web` to Vercel with `NEXT_PUBLIC_API_BASE_URL` set to that Railway URL + `/api/v1`.
3. Go back to the Railway project and set `CORS_ORIGIN` to the Vercel URL Vercel just assigned (`*.vercel.app`, or the custom domain if one's attached), then redeploy/restart the API service so the new env var takes effect.
4. If a custom domain is added later to either service, repeat step 3 with the new domain.

## Platform setup (dashboard settings, since this monorepo needs a couple of non-default values)

**Vercel project settings for `apps/web`:**
- Root Directory: `apps/web`
- Framework Preset: Next.js (auto-detected)
- Build/Install commands: Vercel's default pnpm-workspace detection should work once Root Directory is set; override only if the initial deploy fails.
- Environment variables: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL` (see table above).

**Railway service settings for `apps/api`:**
- Deploy method: Dockerfile (not Nixpacks/buildpacks — this repo's Dockerfile is already built and verified, see below).
- Dockerfile path: `apps/api/Dockerfile`
- Build context: **repo root**, not `apps/api/` — the Dockerfile's `deps` stage copies `packages/types` and root `config/` (needed for `packages/types`' own build step, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). Getting this wrong reproduces bugs already found and fixed locally.
- Exposed port: `4000` (matches `EXPOSE 4000` in the Dockerfile and the app's default).
- Environment variables: `CORS_ORIGIN` at minimum (see table above; step 3 in the ordering above for its actual value).

## Building the API image locally

```bash
docker build -f apps/api/Dockerfile -t reelsavehub-api:test .
docker run --rm -p 4000:4000 reelsavehub-api:test
```

Build context must be the repo root (not `apps/api/`) — the Dockerfile copies `packages/types` and root `config/` into its `deps` stage. Confirmed working locally 2026-08-04, including a real request through the running container (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for the bugs that surfaced getting here).

## What's blocking an actual deploy right now

This environment has no Vercel CLI, no Railway CLI, and no auth tokens for either (checked live, not assumed). Deploying requires the user's own account access — see the request accompanying this doc for exactly what's needed.

## Pre-production readiness checklist

- [ ] All environment variables populated on Vercel & Railway — see the tables above for exactly which ones matter
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
| Railway (backend) | $5/mo (Starter) | $35/mo (Scaled containers) |
| Supabase | $0/mo (Free tier) | $25/mo (Pro tier) |
| Domain | $1/mo | $1/mo |
| **Total** | **~$6/month** | **~$81/month** |
