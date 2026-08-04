import type { InstagramPost } from "@instadrop/types";

export interface IMediaScraper {
  readonly tierName: string;
  extract(url: string): Promise<InstagramPost>;
}
