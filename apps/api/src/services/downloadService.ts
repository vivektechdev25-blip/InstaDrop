import type { Response } from "express";

async function streamToResponse(
  _sourceUrl: string,
  _filename: string,
  _res: Response
): Promise<void> {
  throw new Error("Not implemented yet.");
}

export const downloadService = { streamToResponse };
