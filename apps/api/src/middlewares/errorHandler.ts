import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Invalid request.",
      data: null,
      errors: error.flatten().fieldErrors,
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
    data: null,
    errors: null,
  });
}
