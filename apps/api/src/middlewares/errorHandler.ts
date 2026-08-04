import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

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
      code: "INVALID_URL",
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      data: null,
      errors: null,
      code: error.code,
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
    data: null,
    errors: null,
    code: "SERVER_ERROR",
  });
}
