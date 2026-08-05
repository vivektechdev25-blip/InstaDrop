export type InstadropErrorCode =
  | "INVALID_URL"
  | "PRIVATE_ACCOUNT"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  // Own-private-content flow only (session-cookie auth) - the public
  // flow never produces these.
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED";
