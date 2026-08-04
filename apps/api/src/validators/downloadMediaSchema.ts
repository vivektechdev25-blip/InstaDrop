import { z } from "zod";

export const downloadMediaSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(255),
});

export type DownloadMediaInput = z.infer<typeof downloadMediaSchema>;
