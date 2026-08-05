type SearchParams = { [key: string]: string | string[] | undefined };

export function extractFromQueryParam(searchParams: SearchParams | undefined): string | null {
  if (!searchParams) return null;
  const raw = searchParams.url;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Chrome's address-bar shortcut (instadrop.com/https://instagram.com/...)
 * produces a path containing "//" after the scheme, but Next.js issues a
 * 308 redirect that collapses consecutive slashes before this route ever
 * sees them - confirmed live via `curl -I` (Location header came back
 * with "https:/..." not "https://..."), not assumed. So by the time
 * params.url arrives here, the "//" is already gone: segments look like
 * ["https:", "www.instagram.com", "reel", "X"], not the ["https:", "",
 * "www.instagram.com", ...] shape a naive rejoin would expect. Detect the
 * scheme segment and re-insert "//" explicitly instead of relying on an
 * empty-segment artifact that Next.js strips before we see it.
 */
export function extractFromCatchAllPath(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null;

  const decoded = segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => segment.length > 0);

  const first = decoded[0];
  if (!first) return null;

  const rest = decoded.slice(1);
  const reconstructed = /^https?:$/i.test(first)
    ? `${first}//${rest.join("/")}`
    : decoded.join("/");

  return reconstructed.trim() || null;
}
