"use client";

import { motion } from "framer-motion";
import { Layers, Link, RefreshCw, ShieldCheck, Smartphone, Sparkles, UserX, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

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
          <Card key={feature.title}>
            <CardHeader className="gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.section>
  );
}
