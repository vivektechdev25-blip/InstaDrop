# Testing

Every feature must be manually tested before being considered done. Explicitly cover:

- Edge cases (malformed URLs, non-Instagram URLs, deleted posts)
- Empty states
- Loading states
- Network failures
- Rate-limit states (`RATE_LIMITED`)
- Invalid URLs
- Private account responses (`PRIVATE_ACCOUNT`)

## Status

No automated test suite exists yet. Testing strategy (unit/integration/e2e tooling choice) is pending — to be defined alongside Day 2/3 implementation.
