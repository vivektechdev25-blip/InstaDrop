import { Request, Response, NextFunction } from "express";
import { fetchMediaSchema } from "../validators/fetchMediaSchema";
import { scraperService } from "../services/scraperService";

export async function fetchMediaController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { url } = fetchMediaSchema.parse(req.body);

    // A scrape costs a browser context, which is this service's memory
    // ceiling. If the caller has already hung up - closed the tab, hit the
    // frontend's own 30s timeout, or clicked again - that cost buys
    // nothing, so the work is abandoned instead of queued behind requests
    // that still have someone waiting on them.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const instagramPost = await scraperService.extractMedia(url, {
      signal: controller.signal,
    });

    res.status(200).json({
      success: true,
      message: "Media retrieved successfully.",
      data: instagramPost,
      errors: null,
    });
  } catch (error) {
    next(error);
  }
}
