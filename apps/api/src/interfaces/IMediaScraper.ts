import type { InstagramPost } from "@reelsavehub/types";

export interface IMediaScraper {
  readonly tierName: string;
  extract(url: string): Promise<InstagramPost>;
}
