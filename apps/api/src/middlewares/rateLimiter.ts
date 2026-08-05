import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { PRIVATE_CONTENT_RATE_LIMIT, RATE_LIMIT } from "../constants/rateLimit";

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
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
        message: "Too many requests. Please try again later.",
        data: null,
        errors: null,
        code: "RATE_LIMITED",
      });
    },
  });
}

export const rateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  maxRequests: RATE_LIMIT.MAX_REQUESTS,
});

// Own-private-content flow only - a real user session cookie is a
// meaningfully higher-stakes operation than the public endpoint's
// anonymous URL fetch, so it gets its own, stricter budget (a separate
// express-rate-limit instance, not shared state with `rateLimiter` above -
// exhausting one never affects the other).
export const privateContentRateLimiter = createRateLimiter({
  windowMs: PRIVATE_CONTENT_RATE_LIMIT.WINDOW_MS,
  maxRequests: PRIVATE_CONTENT_RATE_LIMIT.MAX_REQUESTS,
});
