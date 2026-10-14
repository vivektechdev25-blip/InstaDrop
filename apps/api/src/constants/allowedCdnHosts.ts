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
 */
export function isAllowedCdnUrl(url: URL): boolean {
  return url.protocol === "https:" && ALLOWED_CDN_HOSTNAME_PATTERN.test(url.hostname);
}
