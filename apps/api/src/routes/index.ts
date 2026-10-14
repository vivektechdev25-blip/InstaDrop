import { Router } from "express";
import { fetchMediaController } from "../controllers/fetchMediaController";
import { downloadMediaController } from "../controllers/downloadMediaController";
import { privateContentController } from "../controllers/privateContentController";
import { createRateLimiters } from "../middlewares/rateLimiter";

export function createApiRouter(): Router {
  const apiRouter = Router();
  const rateLimiters = createRateLimiters();

  apiRouter.post("/fetch", rateLimiters.fetch, fetchMediaController);
  // Its own, looser limiter - deliberately not the extraction limiter
  // above. One carousel is legitimately up to 20 downloads, which used to
  // exhaust the shared 10-per-10-minute budget partway through the user's
  // own download (see constants/rateLimit.ts).
  apiRouter.get("/download", rateLimiters.download, downloadMediaController);
  // Own-private-content flow (session-cookie authenticated) - separate
  // endpoint from /fetch, not a modification of it, with its own stricter
  // rate limit (3 req/10min vs the public endpoint's 10 req/10min).
  apiRouter.post("/private/fetch", rateLimiters.privateContent, privateContentController);

  return apiRouter;
}
