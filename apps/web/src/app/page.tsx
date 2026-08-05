import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DownloaderPage } from "@/components/downloader/DownloaderPage";
import { FAQ_ENTRIES } from "@/components/marketing/faqData";
import { extractFromQueryParam } from "@/lib/urlParser";

// Below-the-fold marketing sections, code-split into their own chunks -
// same pattern already used for PreviewCard/MobileNav elsewhere in this
// app. SSR stays on (the default - ssr: false isn't used here, unlike
// those two) since this content needs to be in the server-rendered HTML
// for the FAQPage JSON-LD and search crawling to mean anything; this is
// purely a hydration-JS chunk-split, not a client-only deferral.
const HowItWorks = dynamic(() =>
  import("@/components/marketing/HowItWorks").then((mod) => mod.HowItWorks)
);
const FeatureList = dynamic(() =>
  import("@/components/marketing/FeatureList").then((mod) => mod.FeatureList)
);
const Faq = dynamic(() => import("@/components/marketing/Faq").then((mod) => mod.Faq));

interface HomePageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ENTRIES.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: entry.answer,
    },
  })),
};

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

  // Marketing sections (and their FAQPage schema) are plain-homepage
  // content only - see the children prop doc on DownloaderPage for why
  // the ?url= shortcut skips straight to the result instead.
  if (initialUrl) {
    return <DownloaderPage initialUrl={initialUrl} />;
  }

  return (
    <DownloaderPage>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <HowItWorks />
      <FeatureList />
      <Faq />
    </DownloaderPage>
  );
}
