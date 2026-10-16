import { z } from "zod";
import { isAllowedCdnUrlString } from "../constants/allowedCdnHosts";

// Restricts proxy-download targets to Instagram/Facebook CDN hosts only -
// without this, /api/v1/download would be an open proxy that streams any
// URL a caller supplies (SSRF risk). The same allowlist is re-applied per
// redirect hop in downloadService.ts, since this check only ever sees the
// URL the caller submitted, not wherever the CDN redirects it.
//
// Zod runs a refinement even when an earlier check on the same string has
// already failed, so the refinement must be safe on any input - hence the
// non-throwing variant. Measured on production 2026-10-15: `?url=x` got a
// 500 and a logged stack trace, a cheap way to flood the logs.
export const downloadMediaSchema = z.object({
  url: z
    .string()
    .max(4096)
    .url()
    .refine(isAllowedCdnUrlString, {
      message: "URL must be a direct Instagram CDN media link.",
    }),
  filename: z.string().min(1).max(255),
});
