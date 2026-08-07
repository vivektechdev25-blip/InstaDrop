import type { Metadata } from "next";
import { DownloaderPage } from "@/components/downloader/DownloaderPage";
import { extractFromCatchAllPath } from "@/lib/urlParser";

// Address-bar shortcut entry point (reelsavehub.com/<instagram-url>) - a
// utility route, not content, and an unbounded number of paths could
// otherwise match it, so it must never be crawled or indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface CatchAllPageProps {
  params: { url: string[] };
}

export default function CatchAllDownloadPage({ params }: CatchAllPageProps) {
  const initialUrl = extractFromCatchAllPath(params.url);
  return <DownloaderPage initialUrl={initialUrl ?? undefined} />;
}
