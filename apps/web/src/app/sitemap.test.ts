import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { formatLegalDate, PRIVACY_POLICY_UPDATED, TERMS_UPDATED } from "@/lib/legalDates";
import { siteConfig } from "@/lib/siteConfig";

describe("sitemap", () => {
  it("lists exactly the five indexable pages, in order", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual(
      ["", "/support", "/contact", "/privacy-policy", "/terms"].map((path) => `${siteConfig.url}${path}`)
    );
  });

  it("reports each page's real last change, not the time of the request", () => {
    expect(sitemap().map((entry) => entry.lastModified)).toEqual([
      "2026-10-16",
      "2026-10-16",
      "2026-09-26",
      "2026-08-05",
      "2026-08-05",
    ]);
    // A fresh new Date() per call would make these differ.
    expect(JSON.stringify(sitemap())).toBe(JSON.stringify(sitemap()));
  });

  it("uses the same date for the legal pages as the Last updated line they show", () => {
    const byPath = Object.fromEntries(sitemap().map((entry) => [entry.url.replace(siteConfig.url, ""), entry]));
    expect(byPath["/privacy-policy"]!.lastModified).toBe(PRIVACY_POLICY_UPDATED);
    expect(byPath["/terms"]!.lastModified).toBe(TERMS_UPDATED);
    expect(formatLegalDate(PRIVACY_POLICY_UPDATED)).toBe("August 5, 2026");
  });

  it("ranks the pages and leaves out everything noindex", () => {
    const entries = sitemap();
    expect(entries.map((entry) => [entry.changeFrequency, entry.priority])).toEqual([
      ["weekly", 1],
      ["monthly", 0.8],
      ["yearly", 0.4],
      ["yearly", 0.3],
      ["yearly", 0.3],
    ]);
    for (const entry of entries) {
      expect(entry.url).not.toMatch(/\/private|\?url=/);
    }
  });
});
