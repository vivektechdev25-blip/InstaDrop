import type { InstagramPost } from "@reelsavehub/types";
import type { IMediaScraper } from "../interfaces/IMediaScraper";
import { AppError } from "../errors/AppError";
import { instagramUrlDirectTier } from "./scrapers/instagramUrlDirectTier";
import { playwrightTier } from "./scrapers/playwrightTier";

// Tier 1 (fast path) then tier 2 (slower, more resilient fallback) - see
// docs/ARCHITECTURE.md for why, and docs/KNOWN_ISSUES.md for what was
// tested to arrive at this order.
const SCRAPER_TIERS: IMediaScraper[] = [instagramUrlDirectTier, playwrightTier];

async function extractMedia(url: string): Promise<InstagramPost> {
  for (const tier of SCRAPER_TIERS) {
    try {
      return await tier.extract(url);
    } catch (error) {
      if (error instanceof AppError) {
        // A tier reached Instagram and got a definitive answer (private
        // account, post not found) - trust it, don't burn time on further
        // tiers that will hit the same wall.
        throw error;
      }
      console.error(
        `[scraperService] tier "${tier.tierName}" failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  throw new AppError(
    "SERVER_ERROR",
    "We couldn't fetch this post right now. Please try again in a moment.",
    502
  );
}

export const scraperService = { extractMedia };
