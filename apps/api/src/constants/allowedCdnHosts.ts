// Single source of truth for which upstream URLs the download proxy is
// allowed to touch. Lives here rather than inside downloadMediaSchema.ts
// because the check is needed twice, at two different moments: once up
// front on the caller-supplied URL (Zod, before any request is made) and
// again on every redirect hop the CDN sends us to (downloadService) - a
// validated URL that 302s to an internal address would otherwise walk
// straight past the first check.
const ALLOWED_CDN_HOSTNAME_PATTERN = /\.(cdninstagram\.com|fbcdn\.net)$/i;

/**
 * HTTPS only, not just an allowlisted host. Every real Instagram CDN URL
 * is https; plain http would let anything on the network path between the
 * API and the CDN substitute the file streamed to the user, and the other
 * schemes `new URL()` happily parses (ftp:, file:, data:, javascript:)
 * are never legitimate media sources - a `file:`/`data:` Location header
 * has an empty hostname and is rejected here either way.
 *
 * Two more shapes are refused even on an allowlisted host, because no real
 * CDN link has them and both widen what a caller can make this server do:
 * an explicit port (`:22`, `:8443` - turns the proxy into a port prober
 * against those hosts) and embedded credentials (`user:pass@` - sent on to
 * the upstream as an Authorization header the caller chose).
 */
export function isAllowedCdnUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    ALLOWED_CDN_HOSTNAME_PATTERN.test(url.hostname)
  );
}

/**
 * The same check for an untrusted string. `new URL()` throws on input it
 * cannot parse, and a throw inside a Zod refinement escapes as a plain
 * TypeError rather than a validation failure - which is how `?url=x` used
 * to answer 500 and log a stack trace instead of answering 400.
 */
export function isAllowedCdnUrlString(value: string): boolean {
  try {
    return isAllowedCdnUrl(new URL(value));
  } catch {
    return false;
  }
}
