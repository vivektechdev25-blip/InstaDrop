"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardPaste, Download, Eye, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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

// Sits in the grid's "auto" columns between step cards - hidden below sm:,
// where the grid switches from 5 columns (card/connector/card/connector/
// card) back to a single stacked column, so there's nothing horizontal
// left to connect. pt-6 + h-14 deliberately mirror the step Card's own
// top padding (p-6) and icon-circle height, so the dotted line/arrow
// lands at the icon circle's vertical center without guessed pixel values.
function StepConnector() {
  return (
    <div aria-hidden="true" className="hidden sm:block">
      <div className="flex h-14 items-center pt-6">
        <div className="relative h-px w-full border-t border-dotted border-primary/30">
          <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/20 bg-card">
            <ArrowRight className="h-4 w-4 text-primary/60" aria-hidden="true" />
          </span>
        </div>
      </div>
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
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="container py-16 sm:py-24"
    >
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          Getting started
        </span>
        <h2 className="text-h2">How it works</h2>
      </div>

      <div
        role="list"
        className="mx-auto mt-12 grid max-w-4xl grid-cols-1 items-start gap-10 sm:grid-cols-[1fr_56px_1fr_56px_1fr] sm:gap-0"
      >
        {STEPS.map((step, index) => (
          <Fragment key={step.title}>
            {index > 0 ? <StepConnector /> : null}
            <Card role="listitem" className="flex min-w-0 flex-col items-center gap-4 p-6 text-center">
              <div className="relative">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-[11px] font-bold text-primary-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-h3">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </Card>
          </Fragment>
        ))}
      </div>

      <Card className="mx-auto mt-8 flex max-w-4xl flex-col items-center justify-between gap-4 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Zap className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            No login required. No watermark. Original quality — every time.
          </p>
        </div>
        <Button onClick={scrollToInput} className="w-full sm:w-auto">
          Try it now
        </Button>
      </Card>
    </motion.section>
  );
}
