import type { Response } from "express";
import { Readable } from "node:stream";
import { AppError } from "../errors/AppError";
import { isAllowedCdnUrl } from "../constants/allowedCdnHosts";

// A CDN URL that redirects is normal; a chain this long isn't, and
// following one indefinitely is a cheap way to tie up a worker.
const MAX_REDIRECTS = 5;
// Applies to getting response headers back, NOT to streaming the body - a
// real reel is tens of megabytes and legitimately takes longer than this
// to transfer. Without a cap on the first phase, a CDN host that accepts
// the connection and then never answers holds the request (and the
// client's own pending download) open indefinitely, since Express sets no
// default timeout of its own.
const RESPONSE_HEADER_TIMEOUT_MS = 15000;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
  return sanitized || "reelsavenow-media";
}

async function fetchWithHeaderTimeout(url: string): Promise<globalThis.Response> {
  const controller = new AbortController();
  const headerTimeout = setTimeout(() => controller.abort(), RESPONSE_HEADER_TIMEOUT_MS);

  try {
    // redirect: "manual" so every hop is re-checked against the allowlist
    // below - fetch's default would follow them silently.
    return await fetch(url, { redirect: "manual", signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError(
        "SERVER_ERROR",
        "This download took too long to start. Please try again.",
        504
      );
    }
    throw error;
  } finally {
    // Cleared as soon as headers are in, deliberately before the body is
    // read: leaving it armed would abort long, perfectly healthy video
    // transfers partway through.
    clearTimeout(headerTimeout);
  }
}

/**
 * downloadMediaSchema only ever sees the URL the caller submitted. A
 * validated CDN URL that 302s somewhere else would walk straight past that
 * check with fetch's default redirect handling - which is the SSRF hole
 * the allowlist exists to close - so every hop is validated here too,
 * before the request to it is made.
 */
async function fetchMediaFollowingSafeRedirects(sourceUrl: string): Promise<globalThis.Response> {
  let currentUrl = sourceUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedCdnUrl(new URL(currentUrl))) {
      throw new AppError(
        "INVALID_URL",
        "This media link isn't a supported Instagram CDN URL.",
        400
      );
    }

    const response = await fetchWithHeaderTimeout(currentUrl);
    const location = response.headers.get("location");

    if (!REDIRECT_STATUS_CODES.has(response.status) || !location) {
      return response;
    }

    // Release the redirect response's own connection before following it.
    await response.body?.cancel().catch(() => {});
    // Resolved against the current URL, since Location is allowed to be
    // relative - and a relative hop can't leave the host anyway.
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new AppError(
    "SERVER_ERROR",
    "Could not download this media right now. Please try again.",
    502
  );
}

async function streamToResponse(
  sourceUrl: string,
  filename: string,
  res: Response
): Promise<void> {
  let upstreamResponse: globalThis.Response;

  try {
    upstreamResponse = await fetchMediaFollowingSafeRedirects(sourceUrl);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // DNS failure, connection reset, malformed Location header - the
    // caller doesn't need to tell these apart, and errorHandler.ts's
    // generic 500 would be less accurate than "the upstream failed".
    throw new AppError(
      "SERVER_ERROR",
      "Could not download this media right now. Please try again.",
      502
    );
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    throw new AppError(
      "SERVER_ERROR",
      "Could not download this media right now. Please try again.",
      502
    );
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "application/octet-stream";
  // fetch() transparently decompresses a gzip/br/deflate body, but the
  // upstream Content-Length still counts the *compressed* bytes - forwarding
  // it would promise the client a different byte count than what's streamed
  // (a truncated or never-finishing download). Media CDNs don't normally
  // compress binary files, so this is defensive; omitting the header just
  // falls back to chunked transfer.
  const contentLength = upstreamResponse.headers.get("content-encoding")
    ? null
    : upstreamResponse.headers.get("content-length");

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
    let isSettled = false;

    function settle(error?: Error): void {
      if (isSettled) return;
      isSettled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    nodeStream.pipe(res);
    nodeStream.on("error", settle);
    res.on("error", settle);
    res.on("finish", () => settle());
    // Fires on a completed response too (harmlessly - settle() and
    // destroy() are both no-ops by then), but the case it exists for is
    // the client going away mid-download: tab closed, save cancelled,
    // mobile connection dropped. Without tearing the upstream stream down,
    // this keeps pulling CDN bytes into a response nobody is reading.
    res.on("close", () => {
      nodeStream.destroy();
      settle();
    });
  });
}

export const downloadService = { streamToResponse };
