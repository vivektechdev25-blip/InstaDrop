import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instadrop — Instagram Photo & Video Downloader",
  description:
    "Download public Instagram photos, reels, videos, and carousel posts in original quality. No login required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
