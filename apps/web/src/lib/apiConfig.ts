// Single source of truth for the API's base URL. Every caller imports
// API_BASE_URL from here rather than reading process.env itself, so there is
// exactly one place a fallback can exist (see the regression test in
// lib.test.ts, which fails if another file grows its own copy).

// Must stay a literal `process.env.NEXT_PUBLIC_API_BASE_URL`. Next.js inlines
// NEXT_PUBLIC_* values by textual substitution at build time, so destructuring
// process.env or composing the key dynamically yields undefined in the browser
// bundle - silently, with no build error.
const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Local development only: `pnpm dev:api` serves the API here.
//
// Gated on NODE_ENV rather than written as a plain `?? "http://localhost..."`
// so the literal is compiled out of production bundles entirely: webpack
// substitutes NODE_ENV, the branch folds to false, and the minifier drops the
// string. That keeps "does the published bundle mention localhost?" a
// trustworthy one-command check on a deployed site - it is how the 2026-10-14
// breakage was spotted, and an unreachable fallback left in the bundle would
// have made that signal ambiguous.
const DEVELOPMENT_API_BASE_URL =
  process.env.NODE_ENV !== "production" ? "http://localhost:4000/api/v1" : null;

/**
 * Trims the value and removes trailing slashes, so callers can append a path
 * (`${API_BASE_URL}/download`) without producing `//download`. Returns null
 * for an unset or blank value, which is what selects the development
 * fallback below.
 */
export function normalizeApiBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const configured = normalizeApiBaseUrl(CONFIGURED_API_BASE_URL);
  if (configured) return configured;
  if (DEVELOPMENT_API_BASE_URL) return DEVELOPMENT_API_BASE_URL;

  // Unreachable in practice: next.config.js already refuses to start a
  // production build without the variable. Kept as the second layer, because
  // the failure it guards against is silent and only visible to real users.
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL was not set when this production bundle was built."
  );
}

export const API_BASE_URL = resolveApiBaseUrl();
