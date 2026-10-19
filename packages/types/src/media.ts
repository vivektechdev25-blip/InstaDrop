export type MediaType = "image" | "video";

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface MediaItem {
  type: MediaType;
  url: string;
  thumbnail: string;
  dimensions: MediaDimensions;
  /**
   * Videos only: a separate audio stream, present when Instagram served no
   * rendition carrying both picture and sound (it does this to datacenter
   * networks). `url` is then video-only; the download joins the two.
   */
  audioUrl?: string;
  /**
   * Videos only: set when the file has no sound because Instagram muted it
   * (usually licensed music not licensed where the server is). Instagram's
   * own reason, for the site to show alongside the silent video.
   */
  audioMutedReason?: string;
}

export interface InstagramAuthor {
  username: string;
  full_name: string;
}

export interface InstagramPost {
  id: string;
  shortcode: string;
  caption: string;
  author: InstagramAuthor;
  media: MediaItem[];
}
