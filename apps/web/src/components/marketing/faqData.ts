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
    question: "Is ReelSaveNow free?",
    answer: "Yes, completely. No hidden tiers, no paywalls.",
  },
  {
    question: "Do I need to log in?",
    answer: "No. Paste a public post link and download — no account required, ever.",
  },
  {
    question: "What content types are supported?",
    answer: "Photos, Reels, videos, and carousel (multi-photo/video) posts — and the audio of a Reel or video, saved as MP3.",
  },
  {
    question: "Can I download just the audio of a Reel as MP3?",
    answer:
      "Yes. Under the preview of a Reel or video, press Download Audio (MP3) to save only its sound. It's for personal use: the music in a Reel usually belongs to its artists and labels. When Instagram has muted a Reel, usually for licensed music, there is no sound to save, so the button is greyed out and the preview shows Instagram's reason.",
  },
  {
    question: "Can I download private content?",
    answer:
      "Not currently. ReelSaveNow only works with public posts; private-account support isn't available yet.",
  },
  {
    question: "Is the video or photo quality reduced?",
    answer: "No — ReelSaveNow fetches the original file Instagram serves, not a re-compressed copy.",
  },
  {
    question: "Does this work on mobile?",
    answer:
      "Yes. The site is fully responsive, and it can be installed as an app for quicker access.",
  },
  {
    question: "Is there a faster way to use ReelSaveNow?",
    answer:
      "Yes. If you already have an Instagram link copied, you can skip the homepage entirely — just type reelsavenow.com/ directly before the link in your browser's address bar and press enter. You'll land straight on the preview and download screen.",
  },
];
