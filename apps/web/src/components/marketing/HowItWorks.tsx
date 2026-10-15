"use client";

import { ClipboardPaste, Download, Eye, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { reveal } from "@/components/motion/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: ClipboardPaste,
    title: "Paste the link",
    description: "Copy the URL from Instagram's share menu and paste it here.",
  },
  {
    icon: Eye,
    title: "Preview instantly",
    description: "See exactly what you're about to get — photo, video, or every slide of a carousel.",
  },
  {
    icon: Download,
    title: "Download",
    description: "One tap saves the original file straight to your device.",
  },
];

// Normalized coordinate space (0-1000 x 0-400), stretched to fill the
// actual container via preserveAspectRatio="none" - these are
// proportions, not pixels, so the arcs reflow correctly across the whole
// lg:+ width range without any JS measurement. Column x-centers
// approximate a 3-column grid's midpoints (1/6, 1/2, 5/6).
//
// Y endpoints (59 high / 203 low) are computed, not guessed, from the
// real measured layout: container height = elevation(128) + card
// height(226) = 354px; each card's icon-badge sits padding(24) +
// half-icon(28) = 52px from its own card's top. Card 2's icon is 52px
// from the container top -> 52/354*400 = 58.8. Cards 1/3's icon is
// elevation-away -> (128+52)/354*400 = 203.4. These need updating
// together with the `lg:mt-*` elevation value below if it ever changes
// again - they were previously tuned for an 80px elevation and visibly
// fell short of reaching card 3 once elevation grew to 128px.
//
// Arc shape: a single quadratic control point pulled well above both
// endpoints (a genuine upward bulge, not a flat-tangent easing curve -
// see git log for why an earlier cubic version rendered as a near-
// straight line once the opaque Cards masked its flat-tangent zones).
const ARC_1_2 = "M 170 203 Q 335 15 500 59";
const ARC_2_3 = "M 500 59 Q 665 15 830 203";

// Scrolls to and focuses the exact same input a user would click into
// manually - no separate/parallel submit path. HowItWorks only ever
// renders on the plain homepage alongside InputForm (see
// DownloaderPageProps), so #instagram-url is always present here.
function scrollToInput() {
  const input = document.getElementById("instagram-url");
  input?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => input?.focus(), 400);
}

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading" className="container py-12 sm:py-16">
      <div {...reveal()} className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1.5 text-eyebrow uppercase text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Getting started
        </span>
        <h2 id="how-it-works-heading" className="text-h2">
          How it <span className="text-brand-gradient">works</span>
        </h2>
        <p className="max-w-md text-body text-muted-foreground">
          Three simple steps to download Instagram content in original quality.
        </p>
      </div>

      <div className="relative mx-auto mt-12 max-w-4xl sm:mt-14">
        {/* Arc connectors, lg:+ only. Below lg, the composition falls back to
            a flat, unconnected 3-column row (sm:-lg:) or a stacked single
            column (below sm:) - neither can sensibly hold curved paths. They
            draw in once the cards have arrived (globals.css, .reveal-draw);
            whenever reveal is not active they are simply drawn. */}
        <div
          {...reveal(4)}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden lg:block"
        >
          <svg viewBox="0 0 1000 400" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              {/* The logo's colours along the path, left to right. */}
              <linearGradient id="how-it-works-arc" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" style={{ stopColor: "hsl(var(--brand-text-from))" }} />
                <stop offset="50%" style={{ stopColor: "hsl(var(--brand-text-via))" }} />
                <stop offset="100%" style={{ stopColor: "hsl(var(--brand-text-to))" }} />
              </linearGradient>
            </defs>
            {/* Soft blurred halo behind the crisp line. */}
            <g className="opacity-50 blur-[6px]">
              <path d={ARC_1_2} fill="none" stroke="url(#how-it-works-arc)" strokeWidth={5} vectorEffect="non-scaling-stroke" />
              <path d={ARC_2_3} fill="none" stroke="url(#how-it-works-arc)" strokeWidth={5} vectorEffect="non-scaling-stroke" />
            </g>
            <path
              d={ARC_1_2}
              pathLength={1}
              className="reveal-draw"
              fill="none"
              stroke="url(#how-it-works-arc)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={ARC_2_3}
              pathLength={1}
              className="reveal-draw"
              fill="none"
              stroke="url(#how-it-works-arc)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* lg:gap-24 opens up more horizontal space than usual on purpose:
            the arcs are masked wherever they pass under a card's opaque
            background, so a narrow gap leaves only a sliver of curve. */}
        <div role="list" className="relative grid grid-cols-1 items-start gap-10 sm:grid-cols-3 sm:gap-6 lg:gap-24">
          {STEPS.map((step, index) => (
            <Card
              key={step.title}
              role="listitem"
              {...reveal(index + 1)}
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-4 p-6 text-center",
                index !== 1 && "lg:mt-32"
              )}
            >
              <span className="absolute -top-3.5 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-card bg-cta-gradient text-xs font-bold text-white shadow-glow">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange/15 via-brand-pink/15 to-brand-violet/20 text-primary ring-1 ring-inset ring-primary/20">
                <step.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-h3">{step.title}</h3>
                {/* min-h reserves three lines (15px x 1.65) whatever the
                    description's length, so the three cards stay level -
                    step 3's shorter text otherwise left it a line short. */}
                <p className="min-h-[4.7rem] text-body text-muted-foreground">{step.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div
        {...reveal(5)}
        className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-lg border border-primary/20 bg-card px-6 py-5 text-center shadow-sm sm:flex-row sm:justify-between sm:rounded-full sm:py-4 sm:text-left"
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cta-gradient text-white shadow-glow">
            <Zap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <p className="text-body font-semibold">No login required. No watermark.</p>
            <p className="text-sm text-muted-foreground">Original quality, every time.</p>
          </div>
        </div>
        <Button onClick={scrollToInput} className="w-full rounded-full px-6 sm:w-auto">
          Try it now
        </Button>
      </div>
    </section>
  );
}
