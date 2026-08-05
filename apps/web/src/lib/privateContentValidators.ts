// Lenient, client-side sanity check only - same "never trust frontend
// validation" rule as the rest of this project (see docs/SECURITY.md).
// The backend's privateContentSchema.ts is the authoritative check; this
// just gives the user the same fast, no-round-trip feedback the existing
// URL validation already provides, without pretending to know Instagram's
// exact current cookie format (which this project can't live-verify - see
// docs/KNOWN_ISSUES.md).
const SESSION_COOKIE_PATTERN = /^[A-Za-z0-9%:_.-]+$/;
const MIN_COOKIE_LENGTH = 20;
const MAX_COOKIE_LENGTH = 1000;

export function isPlausibleSessionCookie(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= MIN_COOKIE_LENGTH &&
    trimmed.length <= MAX_COOKIE_LENGTH &&
    SESSION_COOKIE_PATTERN.test(trimmed)
  );
}

export function cleanSessionCookie(rawValue: string): string {
  return rawValue.trim();
}
