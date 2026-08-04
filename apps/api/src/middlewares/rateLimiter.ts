import rateLimit from "express-rate-limit";
import { RATE_LIMIT } from "../constants/rateLimit";

export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
      data: null,
      errors: null,
    });
  },
});
