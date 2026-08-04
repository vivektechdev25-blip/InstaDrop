import { Request, Response, NextFunction } from "express";
import { downloadMediaSchema } from "../validators/downloadMediaSchema";
import { downloadService } from "../services/downloadService";

export async function downloadMediaController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { url, filename } = downloadMediaSchema.parse(req.query);
    await downloadService.streamToResponse(url, filename, res);
  } catch (error) {
    next(error);
  }
}
