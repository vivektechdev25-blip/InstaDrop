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
    const instagramPost = await scraperService.extractMedia(url);

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
