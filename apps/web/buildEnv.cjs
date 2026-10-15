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

const EXPECTED_KEY = "NEXT_PUBLIC_API_BASE_URL";
// Chosen against the real names in play, not guessed: the actual outage was
// NEXT_PUBLIC_API_BASE_UR (distance 1); NEXT_PUBLIC_API_URL (5) and a
// leftover NEXT_PUBLIC_API_BASE_URL_OLD (4) are worth naming too; and the
// legitimate sibling NEXT_PUBLIC_SITE_URL sits at 6, so it is never flagged.
const MAX_TYPO_DISTANCE = 5;

/** Levenshtein distance, used only to recognise a near-miss variable name. */
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Names of environment variables that look like a misspelling of
 * NEXT_PUBLIC_API_BASE_URL. The real 2026-10-14 outage was exactly this:
 * the deploy platform had NEXT_PUBLIC_API_BASE_UR (no trailing L), so the
 * dashboard looked correctly configured while Next.js - which matches the
 * name exactly - found nothing and inlined the localhost fallback.
 *
 * Returns names only. Values are never read or reported: a NEXT_PUBLIC_*
 * value is public by definition, but neighbouring variables are not.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
function findLikelyMisspellings(env) {
  return Object.keys(env)
    .filter(
      (key) =>
        key !== EXPECTED_KEY &&
        key.startsWith("NEXT_PUBLIC_") &&
        editDistance(key, EXPECTED_KEY) <= MAX_TYPO_DISTANCE
    )
    .sort();
}

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
 * @param {Record<string, string | undefined>} [env] environment to scan
 */
function assertProductionApiBaseUrl(value, env = process.env) {
  const problem = describeInvalidApiBaseUrl(value);
  if (!problem) return;

  const misspellings = findLikelyMisspellings(env);
  const typoHint = misspellings.length
    ? [
        "",
        `A similarly named variable IS set: ${misspellings.join(", ")}`,
        `Rename it to exactly ${EXPECTED_KEY} - Next.js matches the name`,
        "character for character, so a near-miss reads as 'not set' to the build",
        "while still looking correct in the dashboard.",
      ]
    : [];

  throw new Error(
    [
      `${EXPECTED_KEY} cannot be used for a production build: ${problem}.`,
      "",
      "This value is inlined into the client bundle at build time, so building",
      "without it would publish a site whose requests never reach the API.",
      ...typoHint,
      "",
      "Set it in the build environment before running `next build`. On Netlify:",
      `  Site configuration -> Environment variables -> ${EXPECTED_KEY}`,
      "  Value:   https://<your-api-host>/api/v1   (include /api/v1, no trailing slash)",
      "  Scopes:  must include Builds",
      "  Context: must include Production (not only Deploy previews)",
      "",
      "Check it is set on the site that actually serves the production domain.",
    ].join("\n")
  );
}

module.exports = {
  describeInvalidApiBaseUrl,
  assertProductionApiBaseUrl,
  findLikelyMisspellings,
};
