const INSTAGRAM_URL_PATTERN =
  /^https?:\/\/(www\.)?instagram\.com\/(?:[a-zA-Z0-9_.]+\/)?(p|reel|tv)\/[a-zA-Z0-9_-]+\/?/;

export function isValidInstagramUrl(url: string): boolean {
  return INSTAGRAM_URL_PATTERN.test(url.trim());
}

// Hosts that serve the same post at the same path. m. is the mobile web
// host some share sheets still produce.
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

/**
 * Strips tracking params (e.g. ?igsh=...) and hash fragments, normalizing
 * to a bare https://www.instagram.com/{p|reel|tv}/{shortcode}/ URL.
 *
 * Only for links that are already Instagram's. This used to keep the path
 * and discard the host unconditionally, so a facebook.com/reel/123 or
 * lookalike-domain link was silently rewritten into a real Instagram URL
 * and fetched someone else's post that happened to share the ID. Any other
 * host is returned untouched, so validation rejects it with the normal
 * message.
 */
export function cleanInstagramUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (!INSTAGRAM_HOSTS.has(parsed.hostname)) return trimmed;
    return `https://www.instagram.com${parsed.pathname}`;
  } catch {
    return trimmed;
  }
}
