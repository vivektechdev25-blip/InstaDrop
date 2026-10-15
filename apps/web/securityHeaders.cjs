// Response headers for every page the site serves. Kept out of
// next.config.js so the policy can be unit-tested without starting Next.

const INSTAGRAM_MEDIA_HOSTS = ["https://*.cdninstagram.com", "https://*.fbcdn.net"];

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The Content-Security-Policy, built for what this site actually loads -
 * inventoried 2026-10-15: no third-party scripts, fonts, analytics or
 * frames; previews are <img>/<video> pointing straight at Instagram's CDN;
 * the only network calls are to this API.
 *
 * script-src keeps 'unsafe-inline' deliberately. The App Router streams its
 * payload in inline <script> tags and the theme is applied by an inline
 * script before first paint (no flash of the wrong theme); removing it
 * would need per-request nonces, which a statically served page cannot
 * carry. Everything else is locked to what is needed: no plugins, no
 * <base> hijacking, no framing, no form posts off-site, and network calls
 * only to this origin and the API.
 */
function buildContentSecurityPolicy(apiBaseUrl) {
  const apiOrigin = originOf(apiBaseUrl);
  const connect = ["'self'", apiOrigin].filter(Boolean).join(" ");
  const media = ["'self'", "blob:", ...INSTAGRAM_MEDIA_HOSTS].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src data: ${media}`,
    `media-src ${media}`,
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function buildSecurityHeaders(apiBaseUrl) {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(apiBaseUrl) },
    // Netlify already sends HSTS for the custom domain; restated so the
    // policy does not depend on a platform default. No includeSubDomains
    // or preload: both commit every subdomain to HTTPS, and preload cannot
    // be quickly undone.
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // frame-ancestors covers modern browsers; this covers the rest.
    { key: "X-Frame-Options", value: "DENY" },
    // A pasted Instagram link is the user's business: send only the origin
    // to other sites, never the path or query.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

module.exports = { buildContentSecurityPolicy, buildSecurityHeaders };
