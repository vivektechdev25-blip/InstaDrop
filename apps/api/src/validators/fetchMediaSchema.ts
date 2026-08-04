import { z } from "zod";

export const fetchMediaSchema = z.object({
  url: z
    .string()
    .url()
    .regex(/^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?/, {
      message: "URL must be a public Instagram post, reel, or IGTV link.",
    }),
});

export type FetchMediaInput = z.infer<typeof fetchMediaSchema>;
