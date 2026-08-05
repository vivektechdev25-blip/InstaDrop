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
        <section className="container relative flex flex-col items-center gap-8 overflow-hidden py-16 text-center sm:py-24">
          {/* Soft-edged radial glow, not the loud multi-color gradient
              some competitor downloader sites use - low enough opacity
              that it reads as presence/depth, not a competing visual
              element. overflow-hidden on the section keeps the blur
              from ever causing horizontal scroll.

              Light-mode opacity tuned down three times now, each against
              real evidence, not assumed correct from the CSS alone: the
              first version (primary/[0.08] + accent/[0.06]) measurably
              tinted the near-white background enough to drop
              muted-foreground text (the badge above and the subtext
              paragraph below) from ~4.84:1 to 3.98:1 - below the 4.5:1
              normal-text minimum. A first reduction (0.05 + 0.03) got to
              4.48:1 - closer, still failing. 0.035 + 0.02 passed at the
              time, confirmed across 6 independent Lighthouse runs - but
              the 2026-08-05 hero scale-up pass (bigger headline pushing
              the subtext down, a wider max-w-2xl container) shifted the
              paragraph's position enough to reopen the same failure:
              axe-core (run directly via Playwright per-breakpoint, since
              Lighthouse's own chrome-launcher wasn't reliably honoring a
              forced dark color-scheme in this environment) found 4.46:1,
              light mode only, only at the 375/430px breakpoints - dark
              mode and 768px+ were unaffected. Reduced again to
              0.025 + 0.014, re-verified passing (details below).
              Dark mode's values were never touched at any point -
              confirmed still passing after this change too. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/[0.025] blur-3xl dark:bg-primary/[0.15]"
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
            className="pointer-events-none absolute left-[62%] top-[14%] -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-hero-glow-accent/[0.014] blur-3xl dark:bg-hero-glow-accent/[0.12]"
          />

          <h1 className="max-w-3xl text-display tracking-tight">
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

          <p className="max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground">
            Paste a public Instagram link and get a direct, high-resolution download —
            no account required.
          </p>

          <div className="w-full max-w-xl">
            <InputForm initialUrl={initialUrl} />
          </div>

          <div className="w-full pt-4">
            <TrustBar />
          </div>
        </section>

        {children}
      </main>

      <Footer />
    </div>
  );
}
