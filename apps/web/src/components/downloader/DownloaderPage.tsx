import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { InputForm } from "@/components/downloader/InputForm";
import { TrustBar } from "@/components/marketing/TrustBar";

export interface DownloaderPageProps {
  initialUrl?: string;
  /**
   * Marketing sections (HowItWorks/FeatureList/Faq) - only the plain
   * homepage (app/page.tsx) passes these. The ?url= and [...url] entry
   * points are utility/auto-fetch shortcuts (already noindex - see
   * urlParser.ts), not landing-page traffic, so they stay on just the
   * hero+input, without scrolling a returning/shared-link visitor past
   * marketing copy to get to their result.
   */
  children?: ReactNode;
}

/**
 * The one page shell shared by every entry point (manual homepage,
 * ?url= query param, and the [...url] catch-all address-bar route) -
 * do not fork this layout per entry point.
 */
export function DownloaderPage({ initialUrl, children }: DownloaderPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="container relative flex flex-col items-center gap-6 overflow-hidden py-16 text-center sm:py-24">
          {/* Soft-edged radial glow, not the loud multi-color gradient
              some competitor downloader sites use - low enough opacity
              that it reads as presence/depth, not a competing visual
              element. overflow-hidden on the section keeps the blur
              from ever causing horizontal scroll. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/[0.08] blur-3xl dark:bg-primary/[0.15]"
          />

          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            No login. No watermark. No cost.
          </span>

          <h1 className="max-w-2xl text-display tracking-tight">
            Download Instagram photos, reels &amp; videos in original quality
          </h1>

          <p className="max-w-xl text-balance text-base text-muted-foreground">
            Paste a public Instagram link and get a direct, high-resolution download —
            no account required.
          </p>

          <div className="w-full max-w-xl">
            <InputForm initialUrl={initialUrl} />
          </div>

          <div className="w-full pt-2">
            <TrustBar />
          </div>
        </section>

        {children}
      </main>

      <Footer />
    </div>
  );
}
