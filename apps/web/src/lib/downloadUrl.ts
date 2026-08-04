import type { MediaItem } from "@instadrop/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export function buildDownloadFilename(
  shortcode: string,
  media: MediaItem,
  slideIndex: number,
  slideCount: number
): string {
  const extension = media.type === "video" ? "mp4" : "jpg";
  const suffix = slideCount > 1 ? `_${slideIndex + 1}` : "";
  return `instadrop_${shortcode}${suffix}.${extension}`;
}

export function buildDownloadUrl(media: MediaItem, filename: string): string {
  const params = new URLSearchParams({ url: media.url, filename });
  return `${API_BASE_URL}/download?${params.toString()}`;
}
