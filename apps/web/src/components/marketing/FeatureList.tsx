"use client";

import { Layers, RefreshCw, ShieldCheck, Smartphone, Sparkles, UserX, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { reveal } from "@/components/motion/ScrollReveal";
import { siteConfig } from "@/lib/siteConfig";

// The address-bar shortcut used to be a seventh, full-width card here. It is
// now Method 3 of the step-by-step guide (DownloadGuide), which shows how to
// use it rather than only naming it - one explanation, not two - and the
// six that remain fill a 3 x 2 grid with no odd card out.
interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Sparkles,
    title: "Original quality",
    description: "Photos and videos download at their full source resolution. Nothing is re-compressed or resized.",
  },
  {
    icon: UserX,
    title: "No login required",
    description: "No account, no sign-in, no personal information. Paste a link and go.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-respecting",
    description:
      "Media comes from Instagram's own CDN. Joining audio or making an MP3 uses a temporary file, deleted right after — we never keep a copy.",
  },
  {
    icon: Smartphone,
    title: "Installable app",
    description: "Add ReelSaveNow to your home screen and it works like a native app, on any device.",
  },
  {
    icon: Layers,
    title: "Every content type",
    description: "Photos, Reels, videos and carousel posts, plus a Reel's audio as MP3 — all in one tool.",
  },
  {
    icon: RefreshCw,
    title: "Built for reliability",
    description: "A layered extraction system with an automatic fallback, so one broken path doesn't take the whole thing down.",
  },
];

export function FeatureList() {
  return (
    <section aria-labelledby="features-heading" className="container py-12 sm:py-16">
      <div {...reveal()} className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <span className="text-eyebrow uppercase text-primary">Why choose us</span>
        <h2 id="features-heading" className="text-h2">
          Why <span className="text-brand-gradient">{siteConfig.name}</span>
        </h2>
      </div>

      <div className="mx-auto mt-10 grid max-w-7xl gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {FEATURES.map((feature, index) => (
          <Card
            key={feature.title}
            // Staggered along each row of three, so a row arrives as a sweep
            // rather than all at once - and never as a long queue.
            {...reveal((index % 3) + 1)}
            className="min-w-0"
          >
            <CardHeader className="gap-3 pb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-gradient-to-br from-brand-orange/15 via-brand-pink/15 to-brand-violet/20 text-primary ring-1 ring-inset ring-primary/20">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
