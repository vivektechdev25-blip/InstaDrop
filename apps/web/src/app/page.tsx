import type { Metadata } from "next";
import { DownloaderPage } from "@/components/downloader/DownloaderPage";
import { extractFromQueryParam } from "@/lib/urlParser";

interface HomePageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export function generateMetadata({ searchParams }: HomePageProps): Metadata {
  // The ?url= form is a utility entry point (auto-fetch shortcut), not
  // indexable content - an unbounded number of these could otherwise
  // exist for every Instagram URL ever shared, which is not something
  // search engines should crawl or index.
  if (extractFromQueryParam(searchParams)) {
    return { robots: { index: false, follow: false } };
  }
  return {};
}

export default function HomePage({ searchParams }: HomePageProps) {
  const initialUrl = extractFromQueryParam(searchParams);
  return <DownloaderPage initialUrl={initialUrl ?? undefined} />;
}
