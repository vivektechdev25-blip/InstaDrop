export type ReelSaveNowErrorCode =
  | "INVALID_URL"
  | "PRIVATE_ACCOUNT"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  // An MP3 was asked for, but the file has no audio track to convert.
  | "NO_AUDIO"
  // Own-private-content flow only (session-cookie auth) - the public
  // flow never produces these.
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED";
