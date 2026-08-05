import { z } from "zod";
import { fetchMediaSchema } from "./fetchMediaSchema";

// A real Instagram sessionid is always a long, roughly
// "{numericUserId}:{token}:{token}" value (colon-separated when decoded,
// %3A-encoded when copied raw from DevTools) - but the exact format isn't
// something this project can live-verify without a real test session (see
// docs/KNOWN_ISSUES.md), and Instagram could change it without notice.
// Deliberately lenient: a length range and a permissive character class,
// not a strict structural match. This is a first-pass sanity check, not
// the authoritative check - authentication against Instagram itself
// (privateContentService.ts) is what actually proves the cookie is valid,
// exactly like the project's standing rule to never trust frontend
// validation as the real gate.
const SESSION_COOKIE_PATTERN = /^[A-Za-z0-9%:_.-]+$/;

export const privateContentSchema = z.object({
  sessionCookie: z
    .string()
    .trim()
    .min(20, { message: "That doesn't look like a full session cookie value." })
    .max(1000, { message: "That doesn't look like a valid session cookie value." })
    .regex(SESSION_COOKIE_PATTERN, {
      message: "That doesn't look like a valid session cookie value.",
    }),
  // Reuses the exact same Instagram-URL validator the public flow uses -
  // not a redefinition. Scope for this feature is Reels + Posts only (no
  // Stories - see docs/ARCHITECTURE.md), which this pattern already
  // naturally excludes: Stories use a structurally different URL shape
  // (/stories/{username}/{id}/) this regex was never written to match.
  url: fetchMediaSchema.shape.url,
});

export type PrivateContentInput = z.infer<typeof privateContentSchema>;
