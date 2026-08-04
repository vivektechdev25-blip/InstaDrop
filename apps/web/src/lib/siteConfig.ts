export const siteConfig = {
  name: "Instadrop",
  title: "Instadrop — Instagram Photo & Video Downloader",
  description:
    "Download public Instagram photos, reels, videos, and carousel posts in original quality. No login required.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://instadrop.app",
} as const;
