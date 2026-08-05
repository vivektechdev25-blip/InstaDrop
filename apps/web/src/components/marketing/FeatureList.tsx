"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Layers, Link, RefreshCw, ShieldCheck, Smartphone, Sparkles, UserX, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { AddressBarExample } from "@/components/marketing/AddressBarExample";
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
    description: "Add Instadrop to your home screen and it works like a native app, on any device.",
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
    description: "Already have the Instagram link copied? Type instadrop.com/ right before it in your browser's address bar and hit enter — you'll land straight on the preview, no extra visit needed.",
    visual: <AddressBarExample />,
    wide: true,
  },
];

export function FeatureList() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="container py-16 sm:py-24"
    >
      <div className="mx-auto max-w-xl text-center">
        <h2 className="text-h2">Why Instadrop</h2>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card
            key={feature.title}
            className={cn("min-w-0", feature.wide && "sm:col-span-2 lg:col-span-3")}
          >
            <CardHeader className="gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {feature.wide ? (
                <div className="lg:flex lg:items-center lg:gap-8">
                  <p className="text-sm text-muted-foreground lg:max-w-md">{feature.description}</p>
                  {feature.visual ? (
                    <div className="mt-4 lg:mt-0 lg:w-72 lg:shrink-0">{feature.visual}</div>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                  {feature.visual ? <div className="mt-4">{feature.visual}</div> : null}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.section>
  );
}
