import { Router } from "express";
import { fetchMediaController } from "../controllers/fetchMediaController";
import { downloadMediaController } from "../controllers/downloadMediaController";
import { rateLimiter } from "../middlewares/rateLimiter";

const apiRouter = Router();

apiRouter.post("/fetch", rateLimiter, fetchMediaController);
apiRouter.get("/download", rateLimiter, downloadMediaController);

export { apiRouter };
