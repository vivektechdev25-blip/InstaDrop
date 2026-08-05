export const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 10 * 60 * 1000,
} as const;

// Stricter than the public endpoint - the own-private-content flow
// authenticates with a real user's session cookie, a meaningfully higher-
// stakes operation than an anonymous public URL fetch.
export const PRIVATE_CONTENT_RATE_LIMIT = {
  MAX_REQUESTS: 3,
  WINDOW_MS: 10 * 60 * 1000,
} as const;
