import type { InstadropErrorCode } from "@instadrop/types";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: InstadropErrorCode;

  constructor(code: InstadropErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
