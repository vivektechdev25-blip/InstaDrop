// Build-time validation of the public API URL, shared by next.config.js
// (which is CommonJS, so this file is too) and its unit tests.
//
// Why this exists: NEXT_PUBLIC_* values are inlined into the client bundle
// by `next build`, so whatever is present at build time is what every
// visitor gets, permanently. src/lib/apiConfig.ts falls back to localhost
// for local development, and that fallback used to apply to production
// builds too - a deploy environment missing NEXT_PUBLIC_API_BASE_URL
// produced a completely successful build whose every request went to
// http://localhost:4000. That shipped to reelsavenow.com on 2026-10-14:
// the page loaded fine and every download failed with
// ERR_CONNECTION_REFUSED. Nothing in the build, the tests or the deploy
// log said anything was wrong.
//
// So a production build now refuses to start unless the variable is set to
// something that could plausibly serve the API.

// Hostnames that only ever resolve to the machine running the browser -
// the exact failure this guard exists to prevent.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/**
 * Returns a human-readable reason the value can't be used for a production
 * build, or null when it is usable.
 *
 * @param {string | undefined} value
 * @returns {string | null}
 */
function describeInvalidApiBaseUrl(value) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "it is not set";

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return `"${trimmed}" is not an absolute URL`;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `"${trimmed}" must use http or https`;
  }
  if (LOCAL_HOSTNAMES.has(parsed.hostname)) {
    return `it points at ${parsed.hostname}, which only exists on the visitor's own machine`;
  }
  return null;
}

/**
 * Throws with actionable instructions when a production build would ship an
 * unusable API URL.
 *
 * @param {string | undefined} value
 */
function assertProductionApiBaseUrl(value) {
  const problem = describeInvalidApiBaseUrl(value);
  if (!problem) return;

  throw new Error(
    [
      `NEXT_PUBLIC_API_BASE_URL cannot be used for a production build: ${problem}.`,
      "",
      "This value is inlined into the client bundle at build time, so building",
      "without it would publish a site whose requests never reach the API.",
      "",
      "Set it in the build environment before running `next build`. On Netlify:",
      "  Site configuration -> Environment variables -> NEXT_PUBLIC_API_BASE_URL",
      "  Value:   https://<your-api-host>/api/v1   (include /api/v1, no trailing slash)",
      "  Scopes:  must include Builds",
      "  Context: must include Production (not only Deploy previews)",
      "",
      "Check it is set on the site that actually serves the production domain.",
    ].join("\n")
  );
}

module.exports = { describeInvalidApiBaseUrl, assertProductionApiBaseUrl };
