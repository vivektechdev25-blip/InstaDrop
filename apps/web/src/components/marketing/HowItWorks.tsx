"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ClipboardPaste, Download, Eye, Sparkles, Zap, type LucideIcon } from "lucide-react";
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
// approximate a 3-column grid's midpoints (1/6, 1/2, 5/6); y
// approximates step 2's elevated position vs. steps 1/3's shared lower
// baseline.
//
// Arc shape: a single quadratic control point pulled well above both
// endpoints (a genuine upward bulge, not a flat-tangent easing curve -
// see KNOWN_ISSUES-style history in git log for why the earlier cubic
// version rendered as a near-straight line once the opaque Cards masked
// its flat-tangent zones).
const ARC_1_2 = "M 170 150 Q 335 30 500 70";
const ARC_2_3 = "M 500 70 Q 665 30 830 150";
// Sits roughly level with cards 1/3's icon zone, well above the very
// bottom of the row - reads as a distinct "these three are still one
// sequence" line without crowding the description text below it.
const BASELINE_1_3 = "M 170 230 L 830 230";

// Quadratic midpoints of the two arcs above (t=0.5, hand-computed, not
// guessed), plus the straight line's own midpoint.
const CONNECTOR_DOTS = [
  { left: "33.5%", top: "17.5%" },
  { left: "66.5%", top: "17.5%" },
  { left: "50%", top: "57.5%" },
];

function GlowingDot({ left, top }: { left: string; top: string }) {
  return (
    <div
      aria-hidden="true"
      // motion-safe: is a pure CSS media-query variant (prefers-reduced-
      // motion: no-preference) - the pulse simply doesn't apply under
      // reduced motion, no JS check needed for this piece. Scoped to
      // these small connector dots only; the hero glow stays static per
      // the earlier, separate decision.
      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 motion-safe:animate-dot-pulse"
      style={{ left, top }}
    >
      <div className="absolute inset-0 -m-1.5 rounded-full bg-primary/40 blur-md" />
      <div className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-primary" />
    </div>
  );
}

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
  // Explicit gate, not assumed: framer-motion's whileInView/pathLength
  // animation isn't disabled by prefers-reduced-motion on its own - this
  // project hasn't needed to handle that media feature before now.
  //
  // Went through three real, live-verified bugs to land here:
  // 1. First attempt omitted initial/whileInView entirely for reduced
  //    motion (rather than explicitly setting pathLength: 1) - left
  //    motion.path's default pathLength at 0, so the arcs never became
  //    visible at all, confirmed via getComputedStyle sampled over a
  //    full second, not a single snapshot.
  // 2. Conditionally swapping WHICH props got passed (static branch vs.
  //    animated branch, based on mount state + prefers-reduced-motion)
  //    fixed that, but broke the animation for everyone: framer-motion
  //    only reads `initial` on a component's first mount - changing
  //    props on a later re-render is silently ignored, so paths just
  //    stayed wherever the first render left them. Also, since the
  //    server can never resolve a matchMedia query, server and the
  //    client's first paint disagreed on which branch to take,
  //    producing a real React hydration-mismatch warning (confirmed
  //    live: "Server: 1px 1px, Client: 0px 1px" on every load).
  // 3. Landed on keeping initial/whileInView IDENTICAL on every render
  //    (server and client always agree - no hydration mismatch, and
  //    framer-motion's first-mount-only `initial` is never swapped out
  //    from under itself) and gating only the transition's duration -
  //    0ms (an instant, imperceptible snap to the fully-drawn state)
  //    for reduced motion, the real animated duration otherwise. This
  //    satisfies "elements simply being present" for reduced-motion
  //    users without fighting framer-motion's actual mount model.
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  useEffect(() => setMounted(true), []);

  const reduceMotion = mounted && prefersReducedMotion === true;
  const pathDrawProps = {
    initial: { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: { once: true, margin: "-80px" },
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="container py-16 sm:py-24"
    >
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-muted-foreground shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
          Getting started
        </span>
        <h2 className="text-h2">
          How it{" "}
          <span className="bg-hero-gradient bg-clip-text text-transparent">works</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Three simple steps to download Instagram content in original quality.
        </p>
      </div>

      <div className="relative mx-auto mt-16 max-w-4xl">
        {/* Arc connectors + glowing dots - lg:+ only. Below lg, the
            composition falls back to a flat, unconnected 3-column row
            (sm:-lg:) or a stacked single column (below sm:) - neither
            can sensibly hold curved SVG paths, so no connector of any
            kind renders there rather than a compressed/broken arc. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
          <svg viewBox="0 0 1000 400" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            {/* Soft blurred glow layer, static (not animated) - sits
                behind the crisp animated line below, same "halo behind a
                solid core" technique as GlowingDot, just applied to a
                path instead of a point. */}
            <g className="opacity-70 blur-[6px]">
              <path d={ARC_1_2} className="fill-none stroke-primary" strokeWidth={5} vectorEffect="non-scaling-stroke" />
              <path d={ARC_2_3} className="fill-none stroke-primary" strokeWidth={5} vectorEffect="non-scaling-stroke" />
            </g>
            {/* Draws in after the cards' own whileInView (0.35s, no
                delay) - a short stagger so it reads as "the connection
                draws itself in after the steps appear," not everything
                happening at once. */}
            <motion.path
              d={ARC_1_2}
              className="fill-none stroke-primary/80"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              {...pathDrawProps}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.25 }}
            />
            <motion.path
              d={ARC_2_3}
              className="fill-none stroke-primary/80"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              {...pathDrawProps}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.25 }}
            />
            <motion.path
              d={BASELINE_1_3}
              className="fill-none stroke-primary/25"
              strokeWidth={2}
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
              {...pathDrawProps}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.4 }}
            />
          </svg>
          {CONNECTOR_DOTS.map((dot) => (
            <GlowingDot key={`${dot.left}-${dot.top}`} {...dot} />
          ))}
        </div>

        {/* lg:gap-24 (well beyond the sm: gap) deliberately opens up more
            horizontal space between cards than usual - the arcs are
            masked wherever they pass under a Card's opaque background,
            so a narrow gap leaves only a barely-visible sliver of curve;
            a wide gap is what actually makes the arc read as a real
            sweep rather than a stray dash mark. */}
        <div role="list" className="relative grid grid-cols-1 items-start gap-10 sm:grid-cols-3 sm:gap-6 lg:gap-24">
          {STEPS.map((step, index) => (
            <Card
              key={step.title}
              role="listitem"
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-4 p-6 text-center",
                // Steps 1 and 3 sit at a shared lower baseline; step 2
                // (index 1) stays elevated at the row's top edge.
                index !== 1 && "lg:mt-20"
              )}
            >
              {/* Straddles the card's own top edge, centered - same
                  position on all three cards, unlike the previous
                  pass's icon-corner overlap (which drifted visually
                  depending on the icon box's own size). */}
              <span className="absolute -top-3.5 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-card bg-primary text-xs font-bold text-primary-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-h3">{step.title}</h3>
                {/* min-h reserves 3 lines' worth of space (text-sm's
                    1.6 line-height * 14px = 22.4px/line) regardless of
                    actual line count - step 3's shorter description
                    otherwise wraps to one fewer line than the other two,
                    measured as a real 22px card-height difference. */}
                <p className="min-h-[4.5rem] text-sm text-muted-foreground">{step.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-full border border-border bg-card px-6 py-4 text-center shadow-sm sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Zap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <p className="text-sm font-semibold">No login required. No watermark.</p>
            <p className="text-sm text-muted-foreground">Original quality, every time.</p>
          </div>
        </div>
        <Button onClick={scrollToInput} className="w-full rounded-full sm:w-auto">
          Try it now
        </Button>
      </div>
    </motion.section>
  );
}
