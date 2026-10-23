import { Request, Response, NextFunction } from "express";
import { downloadMediaSchema } from "../validators/downloadMediaSchema";
import { downloadService } from "../services/downloadService";

export async function downloadMediaController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { url, filename, audio, format } = downloadMediaSchema.parse(req.query);
    if (format === "mp3") await downloadService.mp3ToResponse(audio ?? url, filename, res);
    else await downloadService.streamToResponse(url, filename, res, audio);
  } catch (error) {
    next(error);
  }
}
