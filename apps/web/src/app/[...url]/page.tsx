import type { Metadata } from "next";
import { DownloaderPage } from "@/components/downloader/DownloaderPage";
import { extractFromCatchAllPath } from "@/lib/urlParser";

// Address-bar shortcut entry point (reelsavenow.com/<instagram-url>) - a
// utility route, not content, and an unbounded number of paths could
// otherwise match it, so it must never be crawled or indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // noindex, so no canonical either: the root layout's canonical ("/") would
  // otherwise be inherited, and "don't index me" plus "my canonical is the
  // home page" are contradictory signals.
  alternates: { canonical: null },
};

interface CatchAllPageProps {
  params: { url: string[] };
}

export default function CatchAllDownloadPage({ params }: CatchAllPageProps) {
  const initialUrl = extractFromCatchAllPath(params.url);
  return <DownloaderPage initialUrl={initialUrl ?? undefined} />;
}
