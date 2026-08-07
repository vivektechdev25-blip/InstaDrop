# Base image ships Chromium + all OS-level dependencies Playwright needs -
# Alpine's musl libc doesn't reliably run Chromium, and hand-installing the
# Debian dependency list is exactly what this image already does for us.
# The tag's Playwright version MUST match the "playwright" version pinned
# in apps/api/package.json (currently 1.62.1) or the browser binary baked
# into the image won't match what the npm package expects.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS base
WORKDIR /app
RUN corepack enable
# Browsers are already present in this base image - skip the redundant download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
# Full directory, not just package.json: packages/types has a "prepare"
# script that runs `tsc` during install (see its package.json), which
# needs tsconfig.json + src/ already present - confirmed live that a
# package.json-only copy here fails with "path does not exist: tsconfig.json".
COPY packages/types ./packages/types
# packages/types/tsconfig.json extends this - also needed before the
# "prepare" script's tsc invocation runs during install.
COPY config ./config
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app /app
COPY . .
# "..." pulls in @reelsavehub/api's workspace dependencies
# (@reelsavehub/types) so pnpm builds it first - apps/api's own build needs
# packages/types/dist to already exist to resolve types/JS for the compiled
# output.
RUN pnpm --filter "@reelsavehub/api..." build

FROM base AS runner
ENV NODE_ENV=production
# pnpm gives each workspace package its own node_modules full of symlinks
# into the shared /app/node_modules/.pnpm store (e.g.
# apps/api/node_modules/express -> ../../../node_modules/.pnpm/express@.../...) -
# those are relative symlinks, so flattening apps/api/dist to /app/dist
# breaks module resolution ("Cannot find module 'express'", confirmed
# live). Preserving the real monorepo path depth keeps them resolvable.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/app.js"]
