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
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/types/package.json ./packages/types/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @instadrop/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/app.js"]
