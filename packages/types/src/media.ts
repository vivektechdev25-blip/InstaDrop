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
