import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import {
  DOWNLOAD_RATE_LIMIT,
  PRIVATE_CONTENT_RATE_LIMIT,
  RATE_LIMIT,
} from "../constants/rateLimit";

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimiters {
  fetch: RateLimitRequestHandler;
  download: RateLimitRequestHandler;
  privateContent: RateLimitRequestHandler;
}

/**
 * "Try again later" gives a user nothing to act on. express-rate-limit sets
 * Retry-After (seconds) before calling the handler, so the message can say
 * how long - in the same rounding a person would use.
 */
export function describeRetry(retryAfterSeconds: number): string {
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return "Too many requests. Please try again later.";
  }
  if (retryAfterSeconds < 60) {
    return "Too many requests. Please try again in a minute.";
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many requests. Please try again in ${minutes} minutes.`;
}

function createRateLimiter({ windowMs, maxRequests }: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: describeRetry(Number(res.getHeader("Retry-After"))),
        data: null,
        errors: null,
        code: "RATE_LIMITED",
      });
    },
  });
}

/**
 * Three separate express-rate-limit instances, each with its own in-memory
 * store - exhausting one never affects the others (see
 * constants/rateLimit.ts for why each budget is sized the way it is).
 *
 * A factory rather than module-level singletons so each createApp() call
 * gets its own fresh counters. In production that's the same thing (one
 * process, one app), but module-level stores leaked counts between test
 * apps, so a test could pass or fail depending on what ran before it.
 */
export function createRateLimiters(): RateLimiters {
  return {
    fetch: createRateLimiter({
      windowMs: RATE_LIMIT.WINDOW_MS,
      maxRequests: RATE_LIMIT.MAX_REQUESTS,
    }),
    // Media streaming only (GET /download) - independent of the
    // extraction limiter, so saving every slide of a carousel can't
    // consume the budget for fetching the next post.
    download: createRateLimiter({
      windowMs: DOWNLOAD_RATE_LIMIT.WINDOW_MS,
      maxRequests: DOWNLOAD_RATE_LIMIT.MAX_REQUESTS,
    }),
    // Own-private-content flow only - a real user session cookie is a
    // meaningfully higher-stakes operation than the public endpoint's
    // anonymous URL fetch, so it gets its own, stricter budget.
    privateContent: createRateLimiter({
      windowMs: PRIVATE_CONTENT_RATE_LIMIT.WINDOW_MS,
      maxRequests: PRIVATE_CONTENT_RATE_LIMIT.MAX_REQUESTS,
    }),
  };
}
