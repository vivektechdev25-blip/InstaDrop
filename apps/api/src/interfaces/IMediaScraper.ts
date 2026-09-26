import type { InstagramPost } from "@reelsavenow/types";

export interface IMediaScraper {
  readonly tierName: string;
  extract(url: string): Promise<InstagramPost>;
}
