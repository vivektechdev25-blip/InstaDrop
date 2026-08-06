export const siteConfig = {
  name: "Instadrop",
  title: "Instadrop — Instagram Photo & Video Downloader",
  description:
    "Download public Instagram photos, reels, videos, and carousel posts in original quality. No login required.",
  // Plain-text version of the hero headline - used anywhere that can't
  // render the hero's own styled JSX (e.g. the OG image). The hero's
  // <h1> in DownloaderPage.tsx highlights "original quality" in its own
  // gradient <span> and is intentionally left as hand-written JSX rather
  // than sourced from this string - if this tagline ever changes, that
  // heading needs a manual matching update.
  tagline: "Download Instagram photos, reels & videos in original quality",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://instadrop.app",
} as const;
