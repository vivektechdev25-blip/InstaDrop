import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Secondary, crawl-budget-only layer - NOT the primary exclusion
      // mechanism. Both routes already carry their own `noindex` meta
      // tag (see private/page.tsx and page.tsx's generateMetadata),
      // which is what actually keeps them out of the index - per
      // Google's own guidance, a page blocked via Disallow can never be
      // crawled to see its noindex tag, so Disallow alone isn't a
      // reliable way to keep something out of search results. Safe to
      // add here specifically because both have been noindex since they
      // were built - there's nothing already-indexed to accidentally
      // strand. The [...url] catch-all itself is deliberately NOT
      // disallowed: it's an unbounded path pattern (any
      // instadrop.com/<anything>), not a fixed path, so there's no
      // finite rule that excludes it without either being too broad
      // (catching real routes like /contact) or too narrow to matter -
      // its own noindex meta tag is the only mechanism that actually
      // covers it.
      disallow: ["/private", "/*?url="],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
