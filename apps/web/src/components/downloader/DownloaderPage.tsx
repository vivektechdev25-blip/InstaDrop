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
              from ever causing horizontal scroll.

              Light-mode opacity tuned down twice, both times against a
              real Lighthouse run, not assumed correct from the CSS
              alone: the first version (primary/[0.08] + accent/[0.06])
              measurably tinted the near-white background enough to drop
              muted-foreground text (the badge above and the subtext
              paragraph below) from ~4.84:1 to 3.98:1 - below the 4.5:1
              normal-text minimum. A first reduction (0.05 + 0.03) got to
              4.48:1 - closer, still failing. Landed on 0.035 + 0.02,
              confirmed passing across 6 independent Lighthouse runs.
              Dark mode's values were never touched - confirmed passing
              both before and after via a pre-seeded dark-theme Chrome
              profile, screenshot-verified each time as genuinely dark
              (not just trusting the reported score). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/[0.035] blur-3xl dark:bg-primary/[0.15]"
          />
          {/* Second, smaller, lower-opacity blob in the gradient's
              supporting hue - offset to partially overlap the primary
              blob above, reading as a soft two-tone "aurora" rather than
              a wash. Deliberately lower-weight than the primary blob
              (smaller radius, lower opacity at both values) so it stays
              a supporting accent, not equal-weight competing color.
              Nudged down and shrunk slightly from its first version too,
              to reduce overlap with the badge/subtext text zone above -
              opacity alone wasn't the only lever worth using. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-[62%] top-[14%] -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-hero-glow-accent/[0.02] blur-3xl dark:bg-hero-glow-accent/[0.12]"
          />

          <h1 className="max-w-2xl text-display tracking-tight">
            Download Instagram photos, reels &amp; videos in{" "}
            {/* Large text (40-48px/800 weight) qualifies for WCAG's 3:1
                large-text contrast bar, not the stricter 4.5:1 normal-text
                one - confirmed live both gradient stops clear 3:1 in both
                themes (worst case 3.87:1 light / 5.08:1 dark), see
                globals.css for the exact values and how they were checked. */}
            <span className="bg-hero-gradient bg-clip-text text-transparent">
              original quality
            </span>
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
