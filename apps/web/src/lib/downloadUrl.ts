import type { MediaItem } from "@reelsavenow/types";
import { API_BASE_URL } from "@/lib/apiConfig";

/** Only the sound of a video, converted by the API. */
export type DownloadFormat = "mp3";

export interface DownloadOptions {
  format?: DownloadFormat;
}

export function buildDownloadFilename(
  shortcode: string,
  media: MediaItem,
  slideIndex: number,
  slideCount: number,
  { format }: DownloadOptions = {}
): string {
  const extension = format ?? (media.type === "video" ? "mp4" : "jpg");
  const suffix = slideCount > 1 ? `_${slideIndex + 1}` : "";
  return `reelsavenow_${shortcode}${suffix}.${extension}`;
}

export function buildDownloadUrl(media: MediaItem, filename: string, { format }: DownloadOptions = {}): string {
  const params = new URLSearchParams({ url: media.url, filename });
  // A video-only file with its sound in a separate stream: the API joins
  // them - or, for an MP3, converts that stream.
  if (media.type === "video" && media.audioUrl) params.set("audio", media.audioUrl);
  if (format) params.set("format", format);
  return `${API_BASE_URL}/download?${params.toString()}`;
}
