/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "scontent.*.fbcdn.net" },
    ],
  },
  // TEMP demo-only: proxies /api/v1 through this same Next server to the
  // local backend, so a single ngrok tunnel can serve both - no CORS
  // config needed for a quick demo link. Not meant to ship.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:4000/api/v1/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
