import type { ReelSaveHubErrorCode } from "@reelsavehub/types";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ReelSaveHubErrorCode;

  constructor(code: ReelSaveHubErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
