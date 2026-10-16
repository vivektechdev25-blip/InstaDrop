import type { MetadataRoute } from "next";
import { PRIVACY_POLICY_UPDATED, TERMS_UPDATED } from "@/lib/legalDates";
import { siteConfig } from "@/lib/siteConfig";

type SitemapEntry = MetadataRoute.Sitemap[number];

interface Page {
  path: string;
  /** The day the page's content last changed - not the build or request time. */
  lastModified: string;
  changeFrequency: NonNullable<SitemapEntry["changeFrequency"]>;
  priority: number;
}

// Every indexable page, and only those: /private, the [...url] address-bar
// shortcut and ?url= links are noindex and stay out.
//
// UPDATE THE DATE whenever a page's content changes. A lastmod that always
// says "now" (it used to be new Date()) teaches search engines to ignore the
// field. Dates are written here rather than derived from file times or git:
// deploys rewrite file times, and a shallow clone has no history to read.
// The legal pages share theirs with the "Last updated" line they show.
const PAGES: Page[] = [
  { path: "", lastModified: "2026-10-16", changeFrequency: "weekly", priority: 1 },
  { path: "/support", lastModified: "2026-10-16", changeFrequency: "monthly", priority: 0.8 },
  { path: "/contact", lastModified: "2026-09-26", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy-policy", lastModified: PRIVACY_POLICY_UPDATED, changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", lastModified: TERMS_UPDATED, changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: `${siteConfig.url}${page.path}`,
    lastModified: page.lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
