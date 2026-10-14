export const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 10 * 60 * 1000,
} as const;

// Downloads get their own budget rather than sharing the extraction
// limiter above. Sharing one counter meant a single successful fetch (1
// request) plus saving the slides of a real multi-slide carousel (up to
// 20 more) tripped the 429 partway through the user's own download -
// while the limit's actual purpose is throttling expensive extractions
// (a browser render each), not streaming files the caller already paid an
// extraction for. Deliberately not unlimited: /download is still an
// outbound-bandwidth proxy, so it keeps a ceiling, just one sized for
// "download every slide of a long carousel, twice" instead of ten total
// actions of any kind.
export const DOWNLOAD_RATE_LIMIT = {
  MAX_REQUESTS: 60,
  WINDOW_MS: 10 * 60 * 1000,
} as const;

// Stricter than the public endpoint - the own-private-content flow
// authenticates with a real user's session cookie, a meaningfully higher-
// stakes operation than an anonymous public URL fetch.
export const PRIVATE_CONTENT_RATE_LIMIT = {
  MAX_REQUESTS: 3,
  WINDOW_MS: 10 * 60 * 1000,
} as const;
