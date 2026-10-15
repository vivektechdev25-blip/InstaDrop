import type { InstagramPost } from "@reelsavenow/types";

export interface IMediaScraper {
  readonly tierName: string;
  /**
   * Optional fast pre-check. A tier that knows it can't succeed right now
   * (e.g. Tier 1 while its circuit breaker is open) returns false and is
   * skipped silently - no attempt, no per-request failure log.
   */
  isAvailable?(): boolean;
  /**
   * `signal` is aborted when the client disconnects. A tier should use it
   * to stop paying for work nobody is waiting for - above all to drop a
   * queued scrape rather than hand it a browser context.
   */
  extract(url: string, options?: { signal?: AbortSignal }): Promise<InstagramPost>;
}
