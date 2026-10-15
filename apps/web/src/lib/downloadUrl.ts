import type { MediaItem } from "@reelsavenow/types";
import { API_BASE_URL } from "@/lib/apiConfig";

export function buildDownloadFilename(
  shortcode: string,
  media: MediaItem,
  slideIndex: number,
  slideCount: number
): string {
  const extension = media.type === "video" ? "mp4" : "jpg";
  const suffix = slideCount > 1 ? `_${slideIndex + 1}` : "";
  return `reelsavenow_${shortcode}${suffix}.${extension}`;
}

export function buildDownloadUrl(media: MediaItem, filename: string): string {
  const params = new URLSearchParams({ url: media.url, filename });
  return `${API_BASE_URL}/download?${params.toString()}`;
}
