# Deployment

## Environments

| App | Host | Notes |
|---|---|---|
| `apps/web` | Vercel | Hobby tier for MVP, Pro at scale |
| `apps/api` | Railway | Dockerized (`apps/api/Dockerfile`), Starter tier for MVP, single instance |
| Postgres | Supabase | Free tier for MVP |

## Environment variables

See `.env.example` in each app:
- `apps/web/.env.example`
- `apps/api/.env.example`

Never commit real `.env` files — they are gitignored.

## Building the API image locally

```bash
docker build -f apps/api/Dockerfile -t instadrop-api:test .
docker run --rm -p 4000:4000 instadrop-api:test
```

Build context must be the repo root (not `apps/api/`) — the Dockerfile copies `packages/types` and root `config/` into its `deps` stage. Confirmed working locally 2026-08-04, including a real request through the running container (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for the bugs that surfaced getting here).

## Pre-production readiness checklist

- [ ] All environment variables populated on Vercel & Railway
- [ ] CORS domains locked strictly to production domain
- [ ] Rate limiting verified active via load testing
- [ ] Lighthouse SEO/Performance score audited above 95
- [ ] Legal static pages (Privacy, Terms, Contact) active
- [ ] Documentation files complete and current
- [ ] No secrets committed to git history
- [ ] Session-cookie handling audited (if private account feature shipped)

## Cost projections

| Resource | MVP (0–10k MAU) | Scaled (100k+ MAU) |
|---|---|---|
| Vercel (frontend) | $0/mo (Hobby) | $20/mo (Pro) |
| Railway (backend) | $5/mo (Starter) | $35/mo (Scaled containers) |
| Supabase | $0/mo (Free tier) | $25/mo (Pro tier) |
| Domain | $1/mo | $1/mo |
| **Total** | **~$6/month** | **~$81/month** |
