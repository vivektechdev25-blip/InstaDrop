// The "Last updated" date of each legal page, in one place: the page shows it
// and sitemap.ts reports it as <lastmod>, so the two cannot disagree. Change
// the date whenever that page's wording changes.
export const PRIVACY_POLICY_UPDATED = "2026-08-05";
export const TERMS_UPDATED = "2026-08-05";

/**
 * "2026-08-05" -> "August 5, 2026". Pinned to en-US and UTC so the server
 * renders the same text in every environment.
 */
export function formatLegalDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
