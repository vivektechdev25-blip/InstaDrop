import { z } from "zod";

// Restricts proxy-download targets to Instagram/Facebook CDN hosts only -
// without this, /api/v1/download would be an open proxy that streams any
// URL a caller supplies (SSRF risk).
const ALLOWED_CDN_HOSTNAME_PATTERN = /\.(cdninstagram\.com|fbcdn\.net)$/i;

export const downloadMediaSchema = z.object({
  url: z.string().url().refine(
    (value) => ALLOWED_CDN_HOSTNAME_PATTERN.test(new URL(value).hostname),
    { message: "URL must be a direct Instagram CDN media link." }
  ),
  filename: z.string().min(1).max(255),
});

export type DownloadMediaInput = z.infer<typeof downloadMediaSchema>;
