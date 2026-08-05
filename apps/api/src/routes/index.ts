import { Router } from "express";
import { fetchMediaController } from "../controllers/fetchMediaController";
import { downloadMediaController } from "../controllers/downloadMediaController";
import { privateContentController } from "../controllers/privateContentController";
import { rateLimiter, privateContentRateLimiter } from "../middlewares/rateLimiter";

const apiRouter = Router();

apiRouter.post("/fetch", rateLimiter, fetchMediaController);
apiRouter.get("/download", rateLimiter, downloadMediaController);
// Own-private-content flow (session-cookie authenticated) - separate
// endpoint from /fetch, not a modification of it, with its own stricter
// rate limit (3 req/10min vs the public endpoint's 10 req/10min).
apiRouter.post("/private/fetch", privateContentRateLimiter, privateContentController);

export { apiRouter };
