import type { InstagramPost } from "@instadrop/types";

async function extractMedia(_url: string): Promise<InstagramPost> {
  throw new Error("Not implemented yet.");
}

export const scraperService = { extractMedia };
