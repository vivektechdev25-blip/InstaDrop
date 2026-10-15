"use client";

import { type ReactNode } from "react";
import { Layers, Link, RefreshCw, ShieldCheck, Smartphone, Sparkles, UserX, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { AddressBarExample } from "@/components/marketing/AddressBarExample";
import { reveal } from "@/components/motion/ScrollReveal";
import { siteConfig } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  visual?: ReactNode;
  // Spans the full grid width on its own row instead of sitting as a lone
  // narrow card next to empty slots (7 items doesn't divide evenly into a
  // 2 or 3 column grid). At lg+, where it has real room to spare, the
  // description and visual sit side by side instead of stacked - a plain
  // full-width vertical stack there left too much empty space to one side.
  wide?: boolean;
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
    description: "Media streams directly from Instagram's own CDN to your device. We never store a copy on our servers.",
  },
  {
    icon: Smartphone,
    title: "Installable app",
    description: "Add ReelSaveNow to your home screen and it works like a native app, on any device.",
  },
  {
    icon: Layers,
    title: "Every content type",
    description: "Photos, Reels, videos, and carousel posts — one tool, not four.",
  },
  {
    icon: RefreshCw,
    title: "Built for reliability",
    description: "A layered extraction system with an automatic fallback, so one broken path doesn't take the whole thing down.",
  },
  {
    icon: Link,
    title: "Address-bar shortcut",
    description: "Already have the Instagram link copied? Type reelsavenow.com/ right before it in your browser's address bar and hit enter — you'll land straight on the preview, no extra visit needed.",
    visual: <AddressBarExample />,
    wide: true,
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

      <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Card
            key={feature.title}
            // Staggered along each row of three, so a row arrives as a sweep
            // rather than all at once - and never as a long queue.
            {...reveal((index % 3) + 1)}
            className={cn("min-w-0", feature.wide && "sm:col-span-2 lg:col-span-3")}
          >
            <CardHeader className="gap-3 pb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-gradient-to-br from-brand-orange/15 via-brand-pink/15 to-brand-violet/20 text-primary ring-1 ring-inset ring-primary/20">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {feature.wide ? (
                <div className="lg:flex lg:items-center lg:gap-8">
                  <p className="text-body text-muted-foreground lg:max-w-md">{feature.description}</p>
                  {feature.visual ? (
                    <div className="mt-4 lg:mt-0 lg:w-72 lg:shrink-0">{feature.visual}</div>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-body text-muted-foreground">{feature.description}</p>
                  {feature.visual ? <div className="mt-4">{feature.visual}</div> : null}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
