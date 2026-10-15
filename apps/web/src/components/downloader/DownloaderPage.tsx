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
        <section className="container relative flex flex-col items-center gap-6 overflow-hidden pb-8 pt-12 text-center sm:gap-7 sm:pb-10 sm:pt-20">
          {/* The logo's three colours as soft light behind the hero: violet
              at the centre, pink and orange either side, the way they sit in
              the artwork.

              Radial gradients, not blurred circles. Measured on the
              production build (4x CPU, slow network): the three
              filter:blur() layers this started with cost ~200ms of first
              paint, because a large Gaussian blur is expensive to rasterise
              - and that is what a phone without spare GPU headroom, and
              Lighthouse, both do. A gradient that fades to transparent looks
              the same and costs almost nothing.

              Light-mode strength stays tiny: an earlier, stronger glow
              tinted the white page enough to push the grey subtext below
              4.5:1 at mobile widths, re-checked with axe-core whenever it
              moves. overflow-hidden on the section keeps it from causing a
              horizontal scrollbar. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(closest-side_at_50%_22%,hsl(var(--brand-violet)/0.06),transparent),radial-gradient(closest-side_at_28%_26%,hsl(var(--brand-pink)/0.05),transparent_70%),radial-gradient(closest-side_at_74%_30%,hsl(var(--brand-orange)/0.045),transparent_70%)] dark:bg-[radial-gradient(closest-side_at_50%_22%,hsl(var(--brand-violet)/0.42),transparent),radial-gradient(closest-side_at_28%_26%,hsl(var(--brand-pink)/0.2),transparent_70%),radial-gradient(closest-side_at_74%_30%,hsl(var(--brand-orange)/0.12),transparent_70%)]"
          />

          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground/80 shadow-sm">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-gradient" />
            Free Instagram downloader
          </span>

          {/* Kept as hand-written JSX rather than sourced from
              siteConfig.tagline - this heading needs "original quality"
              styled in its own gradient span below, which a single plain
              string can't express. If siteConfig.tagline ever changes,
              this heading needs a manual matching update.

              The second line keeps "in original quality" together from sm:
              up; it used to break as "...videos in / original quality". */}
          <h1 className="max-w-4xl text-display">
            Download Instagram photos, reels &amp; videos{" "}
            <span className="sm:block">
              in <span className="text-brand-gradient">original quality</span>
            </span>
          </h1>

          <p className="max-w-xl text-lead text-muted-foreground">
            Paste a public Instagram link and get a direct, high-resolution download —
            no account required.
          </p>

          <div className="w-full max-w-2xl">
            <InputForm initialUrl={initialUrl} />
          </div>

          <div className="w-full">
            <TrustBar />
          </div>
        </section>

        {children}
      </main>

      <Footer />
    </div>
  );
}
