import { siteConfig } from "@/lib/siteConfig";

// The site's WebApplication schema, rendered by app/layout.tsx. It lives
// here because a layout may only export what Next.js expects, and this is
// worth testing on its own: every feature listed must be one the site
// really has.
export const APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  // Real, deployed asset (apps/web/public/brand/icon-512.png) - not a
  // fabricated/placeholder image reference.
  image: `${siteConfig.url}/brand/icon-512.png`,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  featureList: [
    "Download public Instagram photos",
    "Download Instagram Reels and videos",
    "Download carousel posts",
    "Save a Reel's audio as MP3",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};
