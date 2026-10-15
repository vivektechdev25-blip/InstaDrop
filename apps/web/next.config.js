const { PHASE_PRODUCTION_BUILD } = require("next/constants");
const { assertProductionApiBaseUrl } = require("./buildEnv.cjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "scontent.*.fbcdn.net" },
    ],
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
