import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

interface HttpClientError {
  status: number;
  type: string;
}

/**
 * body-parser (express.json()) rejects malformed or oversized bodies with
 * an http-errors object: a 4xx `status`, a `type` such as
 * "entity.parse.failed", and - the dangerous part - the raw request text
 * on a `body` property. These used to fall through to the generic branch
 * below, which answered 500 (it's the client's error, not ours) and
 * console.error'd the whole object, `body` included: a malformed
 * /private/fetch request wrote the caller's session cookie to the logs.
 */
function isHttpClientError(error: unknown): error is HttpClientError {
  if (typeof error !== "object" || error === null) return false;
  const { status, type } = error as Partial<HttpClientError>;
  return typeof status === "number" && status >= 400 && status < 500 && typeof type === "string";
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  // A failure partway through streaming a download: the status line and
  // media headers are already on the wire, so a JSON error can't be sent.
  // Express's default handler closes the connection instead, which is
  // what the client needs to see the transfer as failed.
  if (res.headersSent) {
    return next(error);
  }

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

  if (isHttpClientError(error)) {
    return res.status(error.status).json({
      success: false,
      message: error.status === 413 ? "Request body is too large." : "Invalid request.",
      data: null,
      errors: null,
      code: "INVALID_URL",
    });
  }

  // The stack (which includes the message), never the whole object: an
  // error's enumerable properties can carry request data - exactly how the
  // body-parser case above leaked.
  console.error(error instanceof Error ? error.stack ?? error.message : "Non-Error thrown");

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
    data: null,
    errors: null,
    code: "SERVER_ERROR",
  });
}
