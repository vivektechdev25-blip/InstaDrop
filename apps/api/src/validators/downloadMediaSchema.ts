import { z } from "zod";
import { isAllowedCdnUrl } from "../constants/allowedCdnHosts";

// Restricts proxy-download targets to Instagram/Facebook CDN hosts only -
// without this, /api/v1/download would be an open proxy that streams any
// URL a caller supplies (SSRF risk). The same allowlist is re-applied per
// redirect hop in downloadService.ts, since this check only ever sees the
// URL the caller submitted, not wherever the CDN redirects it.
export const downloadMediaSchema = z.object({
  url: z.string().url().refine(
    (value) => isAllowedCdnUrl(new URL(value)),
    { message: "URL must be a direct Instagram CDN media link." }
  ),
  filename: z.string().min(1).max(255),
});

export type DownloadMediaInput = z.infer<typeof downloadMediaSchema>;
