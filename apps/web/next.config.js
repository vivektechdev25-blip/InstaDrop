const { PHASE_PRODUCTION_BUILD } = require("next/constants");
const { assertProductionApiBaseUrl } = require("./buildEnv.cjs");
const { buildSecurityHeaders } = require("./securityHeaders.cjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Nothing renders next/image - previews are plain <img>/<video> pointing
  // at Instagram's CDN - but the remotePatterns that used to sit here still
  // switched on /_next/image for those hosts. Verified on production
  // 2026-10-15: reelsavenow.com/_next/image fetched and served an arbitrary
  // cdninstagram.com image (200, image/jpeg), an open image proxy billed to
  // this site's bandwidth, and the endpoint several open Next.js advisories
  // target. Unoptimized with no remote hosts closes it.
  images: { unoptimized: true },
  // `next dev` relies on eval for fast refresh, which a strict CSP blocks;
  // the policy is for what users receive, so it is applied to production
  // builds only.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(process.env.NEXT_PUBLIC_API_BASE_URL),
      },
    ];
  },
};

// The check runs here, in the `next build` process itself, rather than inside
// application code: it then runs exactly once, before anything is compiled,
// with the deploy platform's environment fully populated - and it fails the
// deploy instead of publishing a bundle that points at localhost (see
// buildEnv.cjs).
//
// The phase alone is not enough to identify a build: `next lint` loads the
// config under PHASE_PRODUCTION_BUILD too, and linting must not require
// deploy-time variables. The subcommand disambiguates them.
const isBuildCommand = process.argv.slice(2).includes("build");

module.exports = (phase) => {
  if (phase === PHASE_PRODUCTION_BUILD && isBuildCommand) {
    assertProductionApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  }
  return nextConfig;
};
