import type { ReelSaveNowErrorCode } from "@reelsavenow/types";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ReelSaveNowErrorCode;

  constructor(code: ReelSaveNowErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
