import { Request, Response, NextFunction } from "express";
import { privateContentSchema } from "../validators/privateContentSchema";
import { privateContentService } from "../services/privateContentService";

export async function privateContentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { sessionCookie, url } = privateContentSchema.parse(req.body);
    const instagramPost = await privateContentService.fetchOwnPrivateContent(sessionCookie, url);

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
