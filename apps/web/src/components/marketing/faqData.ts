export interface FaqEntry {
  question: string;
  answer: string;
}

// Plain data, deliberately in its own non-"use client" module - both the
// server-rendered app/page.tsx (FAQPage JSON-LD) and the client-rendered
// Faq.tsx (the accordion UI) import this same list, so the visible copy
// and the structured data can never drift apart. Re-exporting it through
// Faq.tsx (a "use client" file) instead broke the server build: Next
// treats every export of a "use client" module as a client reference,
// so page.tsx's server-side .map() over it failed at build time.
export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "Is Instadrop free?",
    answer: "Yes, completely. No hidden tiers, no paywalls.",
  },
  {
    question: "Do I need to log in?",
    answer: "No. Paste a public post link and download — no account required, ever.",
  },
  {
    question: "What content types are supported?",
    answer: "Photos, Reels, videos, and carousel (multi-photo/video) posts.",
  },
  {
    question: "Can I download private content?",
    answer:
      "Not currently. Instadrop only works with public posts; private-account support isn't available yet.",
  },
  {
    question: "Is the video or photo quality reduced?",
    answer: "No — Instadrop fetches the original file Instagram serves, not a re-compressed copy.",
  },
  {
    question: "Does this work on mobile?",
    answer:
      "Yes. The site is fully responsive, and it can be installed as an app for quicker access.",
  },
];
