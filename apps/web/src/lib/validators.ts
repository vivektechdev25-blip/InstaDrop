const INSTAGRAM_URL_PATTERN =
  /^https?:\/\/(www\.)?instagram\.com\/(?:[a-zA-Z0-9_.]+\/)?(p|reel|tv)\/[a-zA-Z0-9_-]+\/?/;

export function isValidInstagramUrl(url: string): boolean {
  return INSTAGRAM_URL_PATTERN.test(url.trim());
}

/**
 * Strips tracking params (e.g. ?igsh=...) and hash fragments, normalizing
 * to a bare https://www.instagram.com/{p|reel|tv}/{shortcode}/ URL.
 */
export function cleanInstagramUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    return `https://www.instagram.com${parsed.pathname}`;
  } catch {
    return rawUrl.trim();
  }
}
