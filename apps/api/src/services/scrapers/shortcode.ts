export function extractShortcode(url: string): string {
  const match = url.match(/\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/);
  return match?.[2] ?? "";
}
