# Deployment

## Environments

| App | Host | How it builds |
|---|---|---|
| `apps/web` | **Netlify** | pnpm workspace build from the repo root, Next.js via Netlify's OpenNext adapter |
| `apps/api` | **Railway** | Docker, built from the **root `Dockerfile`** (auto-detected - see below) |
| Postgres (Supabase) | — | **Not used.** There is no database; the unwired request-log scaffold was removed 2026-10-16, see [DATABASE.md](./DATABASE.md) |

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

**The Dockerfile is found automatically.** It sits at the repository root, and Railway "will look for and use a `Dockerfile` at the root of the source directory". So the service needs **no** builder setting, **no** `RAILWAY_DOCKERFILE_PATH` variable and **no** config file. The start command is the image's `CMD` (`node dist/server.js`); leave any custom start command empty.

`railway.json` is kept and points at the same file, but do not rely on it: Railway has deprecated Config as Code and **new services cannot opt into it**, which is exactly why a deploy fell back to Railpack auto-detection and failed with "No start command detected" (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)). `.railway/railway.ts` would not help either - Railway does not read it during deploys.

Check in the Railway dashboard:
- **Root directory: empty (repo root).** The Dockerfile's `deps` stage copies `packages/types` and root `config/`; a narrower build context fails with `path does not exist: tsconfig.json` (a bug already hit and fixed locally — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)).
- No custom start command overriding `CMD`. If one was set before 2026-10-14 it may still say `node dist/app.js`, which no longer starts the server — the entry point moved to `dist/server.js` (`app.ts` now only builds the Express app, so it can be tested in-process).

### Environment variables (runtime)

| Var | Required? | Notes |
|---|---|---|
| `PORT` | Set by Railway | Validated at startup (integer 1–65535) — a malformed value used to become `NaN`, which Node treats as "any free port". Defaults to `4000`. The server binds `0.0.0.0`; a loopback-only bind is unreachable from outside the container. |
| `CORS_ORIGIN` | **Yes** | Comma-separated **exact** origins, e.g. `https://<netlify-production-domain>,https://<custom-domain>`. Validated at startup: a trailing slash, path, mixed-case host or `*` fails the boot with the exact value to use, instead of silently never matching the browser's `Origin` header. Unset → `http://localhost:3000` (fails safe, never a wildcard). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **No** | Nothing reads them any more (the code that did was removed 2026-10-16). If they are still set on a host, they are harmless and can be deleted there. |
| `SCRAPER_MAX_CONCURRENCY` | **No** | How many browser contexts may run at once. Default `1`. Measured 2026-10-15 in a 512MB container under a 20-request burst: `1` peaks at 337MB (66%), `2` peaks at 504MB (98%). Raise to `2` only on an instance with 1GB or more. |
| `SCRAPER_MAX_QUEUED` | **No** | How many requests may wait for a slot. Default `3`. Deeper queues mean callers waiting past the frontend's own 30s timeout, for work nobody is still there to receive. |
| `SCRAPER_QUEUE_WAIT_MS` | **No** | How long a queued request waits before getting a 503. Default `10000`. |
| `SCRAPER_TIMEOUT_MS` | **No** | Hard cap on one scrape, after which it fails with 504 and frees its slot. Default `45000`. |
| `DOWNLOAD_MAX_CONCURRENCY` | **No** | Transfers `/download` runs at once before answering 503. Default `32` — inside the measured-safe range (40 stalled clients peaked at 94MB). |
| `DOWNLOAD_IDLE_TIMEOUT_MS` | **No** | A transfer whose upstream sends nothing for this long is cut off. Default `30000`. |
| `DOWNLOAD_MAX_BYTES` | **No** | Largest file relayed. Default 300MB. |
| `FFMPEG_PATH` | **No** | ffmpeg used to join a video-only file to its separate audio stream. Default `ffmpeg` on `PATH`; the Docker image installs it. Without it, those videos download silent. |
| `DOWNLOAD_MUX_TIMEOUT_MS` | **No** | How long the join may take before the video is sent alone. Default `60000`. |
| `INSTAGRAM_REGION_PROXY_URL` | **No** | A proxy in India, `http://user:password@host:port` (or `https://`; `socks5://` only without a username and password, which Chromium cannot send to SOCKS5). Used only when Instagram has muted a post's sound in the API's own country — licensed music, see [Licensed music and the region proxy](#licensed-music-and-the-region-proxy). Unset: those reels download silent, and the site says why. A malformed value stops the boot, with an error that names the problem but never the password. |
| `TRUST_PROXY` | **No** | Leave unset. Overrides which forwarding hops are trusted: an integer is a hop count, otherwise a comma-separated list of names/CIDRs. The default trusts every non-public address and keys on the right-most public one — see SECURITY.md. |
| `RAILWAY_GIT_COMMIT_SHA` | Set by Railway | Not set by hand. Reported by `/health` as `commit`, which is how a deploy is verified. |
| `SCRAPER_BROWSER_RECYCLE_AFTER` | **No** | Contexts served before the idle browser is relaunched to reclaim memory Chromium does not return. Default `40`. |

### Chromium in the container

- Base image `mcr.microsoft.com/playwright:v1.62.1-jammy` ships Chromium and its OS libraries. Its tag **must** match the `playwright` version pinned in `apps/api/package.json`, or the browser binary won't match what the npm package expects.
- Launch flags `--disable-dev-shm-usage` (containers mount `/dev/shm` at 64MB, which Chromium exhausts on an image-heavy page) and `--no-sandbox` (the image runs as root). The `--no-sandbox` justification depends on only ever navigating to Instagram — see the URL-validation tests.
- **Concurrency cap:** 1 browser context at once by default (`SCRAPER_MAX_CONCURRENCY`), 3 queued (`SCRAPER_MAX_QUEUED`), `503` beyond (`browserManager.ts`). A muted reel's region re-read waits only for the scrape running now, not behind the queue. The browser un-caches itself when it dies, so an OOM-killed Chromium no longer leaves a healthy-looking but permanently broken service.
- **Memory:** see the measured figure in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (container run, 2026-10-14) before choosing a Railway plan. If the service restarts under real use, that's the memory ceiling.

### Licensed music and the region proxy

**Why it can be needed.** Instagram lists different renditions for a post depending on the country the page is requested from. For a reel whose licensed music is not licensed in that country, it mutes the reel there: only video-only renditions and no audio stream (`should_mute_audio=true`, reason "This music can't be played due to recent licensing changes with the rights holder."). On 2026-10-16 production read Instagram from the US (CDN hosts `scontent-sjc*`) and `DdrSGp3SqWG` downloaded silent, while from India it plays with sound. On 2026-10-19, after the Railway service was moved to Singapore (`asia-southeast1`), production got Singapore CDN hosts (`scontent-sin*`) and the same reel downloaded with sound. Which reels come out muted depends on where the API reads Instagram from — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#root-cause-of-sometimes-the-video-has-no-sound--2026-10-19).

**Whether you need it.** Every muted reel logs `[regionRecovery] Instagram muted this post's sound in this server's country and INSTAGRAM_REGION_PROXY_URL is not set`. If that line never appears in the Railway log, a proxy would never be used.

**What the API does with a proxy.** Only for a post Instagram muted in the API's country, it re-reads the page through `INSTAGRAM_REGION_PROXY_URL` — the HTML document only, about 700KB — and takes the renditions Instagram lists in the proxy's country. Probing and the download itself stay direct (measured on two reels: the production server downloaded the India-served files, both tracks). Every other post never touches the proxy.

- The re-read starts only if the request can still finish within 25 seconds (the site gives up at 30), and the page load through the proxy is capped at 12 seconds.
- If the proxy itself fails — unreachable, wrong password, too slow, or Instagram serves no post through it — it is skipped for 5 minutes. A busy server, a user who left, or a reel with no sound there either does not pause it.
- Whenever sound cannot be had, the reel downloads silent and the site shows Instagram's reason.
- Not every muted reel can be recovered: Instagram may mute the same music in India too.

**Setting it up — option A, a small server in India.** The smallest plan is plenty. Providers with Indian regions include DigitalOcean (Bangalore), AWS Lightsail (Mumbai) and Oracle Cloud (Mumbai, Hyderabad); check current prices and free tiers yourself.

1. Create the smallest Linux server in an Indian region and install Node 20+.
2. Copy `scripts/region-proxy.cjs` to `/opt/region-proxy/region-proxy.cjs`. It only tunnels HTTPS to Instagram's own hosts, only where they resolve to public addresses, and always requires the password — it cannot become an open proxy.
3. Put the credentials in a file only root can read — not in the unit file, which every user on the server can read, as can `systemctl show`:

   ```sh
   sudo install -m 600 /dev/null /etc/region-proxy.env
   sudo nano /etc/region-proxy.env
   ```

   ```ini
   PROXY_USER=reelsavenow
   PROXY_PASSWORD=<long random password, for example the output of: openssl rand -hex 24>
   PORT=8899
   ```

4. Run it as a service:

   ```ini
   # /etc/systemd/system/region-proxy.service
   [Unit]
   Description=ReelSaveNow region proxy
   After=network-online.target
   Wants=network-online.target

   [Service]
   EnvironmentFile=/etc/region-proxy.env
   ExecStart=/usr/bin/node /opt/region-proxy/region-proxy.cjs
   DynamicUser=yes
   NoNewPrivileges=yes
   ProtectSystem=strict
   ProtectHome=yes
   PrivateTmp=yes
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   `sudo systemctl enable --now region-proxy`. systemd reads the env file as root, then runs the proxy as a throwaway unprivileged user. Check the node path in `ExecStart` with `which node`; follow the log with `journalctl -u region-proxy -f`.
5. Open TCP 8899 in the provider's firewall and the server's own (`sudo ufw allow 8899/tcp`). If your Railway plan has static outbound IPs, allow only those.
6. On Railway, set `INSTAGRAM_REGION_PROXY_URL=http://reelsavenow:<password>@<server-ip>:8899` (percent-encode special characters in the password; a hex password has none) and redeploy.

**Option B, a paid proxy service with an India location.** Use the `http://user:pass@host:port` or `https://…` address it gives you. `socks5://` works only without a username and password. The API sends it only page reads of muted posts.

**Security notes.**

- With `http://`, the proxy password crosses the internet unencrypted between Railway and the proxy; the Instagram traffic inside the tunnel stays TLS. Someone who captured it could reach only Instagram's hosts through your server — using its bandwidth and risking its IP being rate-limited — so use a password made for this alone, and change it if in doubt. An `https://` proxy avoids this.
- The proxy logs the hosts it tunnels to and what it refuses, never passwords or page contents. It drops a connection that has not finished its request within 10 seconds and holds at most 256 connections and 64 tunnels.

**Checking it works.** After the deploy, right after `ReelSaveNow API listening on port …`, the API log reads `[regionProxy] reels whose music Instagram mutes here will be re-read through http://<server-ip>:8899`. When a muted reel is fetched, the log shows `re-reading the page through …` followed by `recovered the sound: …`, and the file has sound. `[regionRecovery] could not re-read the page through the proxy (…)` means the proxy is unreachable, the password is wrong, or Instagram served nothing through it; when that is the proxy's fault, `[circuitBreaker] "region-proxy" disabled for 5 min` follows.

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

docker build -t reelsavenow-api .
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
