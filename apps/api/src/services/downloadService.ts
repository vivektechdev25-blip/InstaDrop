import type { Response } from "express";
import { Readable } from "node:stream";
import { AppError } from "../errors/AppError";

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
  return sanitized || "reelsavehub-media";
}

async function streamToResponse(
  sourceUrl: string,
  filename: string,
  res: Response
): Promise<void> {
  const upstreamResponse = await fetch(sourceUrl);

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    throw new AppError(
      "SERVER_ERROR",
      "Could not download this media right now. Please try again.",
      502
    );
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = upstreamResponse.headers.get("content-length");

  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${sanitizeFilename(filename)}"`
  );
  if (contentLength) {
    res.setHeader("Content-Length", contentLength);
  }

  // Web ReadableStream -> Node Readable; the `as never` sidesteps a type
  // mismatch between the DOM lib's ReadableStream (needed for Playwright's
  // page.evaluate typings elsewhere) and Node's own stream/web type for the
  // same runtime object.
  const nodeStream = Readable.fromWeb(upstreamResponse.body as never);

  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(res);
    nodeStream.on("error", reject);
    res.on("finish", resolve);
    res.on("error", reject);
  });
}

export const downloadService = { streamToResponse };
