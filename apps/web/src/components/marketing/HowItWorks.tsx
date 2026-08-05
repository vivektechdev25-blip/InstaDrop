"use client";

import { motion } from "framer-motion";
import { ClipboardPaste, Download, Eye, type LucideIcon } from "lucide-react";

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

export function HowItWorks() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="container py-16 sm:py-24"
    >
      <div className="mx-auto max-w-xl text-center">
        <h2 className="text-h2">How it works</h2>
      </div>

      <ol className="mx-auto mt-12 grid max-w-4xl gap-10 sm:grid-cols-3 sm:gap-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <step.icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step {index + 1}
              </span>
              <h3 className="text-h3">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </motion.section>
  );
}
