import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Clapperboard,
  ImageIcon,
  Laptop,
  Layers,
  LifeBuoy,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserX,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/Card";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Support",
  description: `What ${siteConfig.name} can download, how to use it on a phone or a computer, and what to do when a link or download doesn't work.`,
  alternates: { canonical: "/support" },
};

/*
 * Everything on this page describes what the app actually does today - the
 * accepted links (lib/validators.ts: /p/, /reel/ and /tv/ on instagram.com),
 * the file types (lib/downloadUrl.ts: MP4 for video, JPG for photos), the
 * one-item-at-a-time carousel download (PreviewCard) and, under
 * Troubleshooting, the exact messages the site and API show. If any of
 * those change, this page has to change with them.
 */

interface Feature {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
}

const DOWNLOADS: Feature[] = [
  {
    icon: Clapperboard,
    title: "Instagram Reels",
    body: (
      <>
        Paste the link to a public Reel — it looks like <Code>instagram.com/reel/…</Code> — and you get a
        preview of the video. Press Download to save it as an MP4 file.
      </>
    ),
  },
  {
    icon: ImageIcon,
    title: "Photos",
    body: (
      <>
        Paste the link to a public photo post (<Code>instagram.com/p/…</Code>). The preview shows the image,
        and Download saves it as a JPG file.
      </>
    ),
  },
  {
    icon: Video,
    title: "Videos",
    body: (
      <>
        Video posts work the same way as Reels, and so do IGTV links (<Code>instagram.com/tv/…</Code>):
        check the preview, then press Download to save the MP4.
      </>
    ),
  },
  {
    icon: Layers,
    title: "Carousels",
    body: (
      <>
        For a post with several photos or videos, the preview holds every item. Move between them with the
        arrows or dots — Download saves the item on screen, numbered in its file name, so repeat it for each
        one you want.
      </>
    ),
  },
];

const PROMISES: Feature[] = [
  {
    icon: Sparkles,
    title: "Original quality",
    body: "You get the same file Instagram serves for the post, at the highest quality Instagram makes available for it. We don't re-compress, resize or watermark anything.",
  },
  {
    icon: UserX,
    title: "No login required",
    body: `You never sign in to ${siteConfig.name} and there is no account to create — paste a public link and download. Because nothing is signed in, only public posts can be downloaded.`,
  },
  {
    icon: ShieldCheck,
    title: "Nothing kept on our servers",
    body: "The file streams from Instagram's own servers straight to your device. We don't store a copy of what you download.",
  },
];

interface Device {
  icon: LucideIcon;
  title: string;
  steps: ReactNode[];
  tip: ReactNode;
}

const DEVICES: Device[] = [
  {
    icon: Smartphone,
    title: "Phones and tablets",
    steps: [
      <>
        In the Instagram app, tap <strong className="font-semibold text-foreground">Share</strong> under the post,
        then <strong className="font-semibold text-foreground">Copy link</strong>.
      </>,
      <>Open {siteConfig.name} in your browser and paste the link — the paste button in the box does it in one tap.</>,
      <>
        Tap <strong className="font-semibold text-foreground">Download</strong>. The file saves wherever your browser
        keeps downloads.
      </>,
    ],
    tip: <>Your browser can add {siteConfig.name} to your home screen, so it opens like an app.</>,
  },
  {
    icon: Laptop,
    title: "Laptops and desktops",
    steps: [
      <>
        Open the post on instagram.com and copy its link — from the{" "}
        <strong className="font-semibold text-foreground">⋯</strong> menu or the address bar.
      </>,
      <>Paste it on {siteConfig.name} and check the preview.</>,
      <>
        Press <strong className="font-semibold text-foreground">Download</strong>. The file saves to your browser&apos;s
        downloads folder.
      </>,
    ],
    tip: (
      <>
        Shortcut: type <Code>reelsavenow.com/</Code> in front of the Instagram link in the address bar and press
        Enter — you land straight on the preview.
      </>
    ),
  },
];

interface Problem {
  title: string;
  /** What the site shows, word for word; null where it shows no message. */
  message: string | null;
  fix: ReactNode;
}

const PROBLEMS: Problem[] = [
  {
    title: "The link isn't accepted",
    message: "Please paste a valid public Instagram post, reel, or IGTV link.",
    fix: (
      <>
        Copy the link again with <strong className="font-semibold text-foreground">Copy link</strong> and paste the
        whole thing. It should contain <Code>/p/</Code>, <Code>/reel/</Code> or <Code>/tv/</Code>. Profile links,
        Stories and Highlights aren&apos;t supported.
      </>
    ),
  },
  {
    title: "The post is from a private account",
    message: "This content is from a private Instagram account and cannot be processed.",
    fix: <>Only posts from public accounts can be downloaded. If the account is private, the post can&apos;t be fetched.</>,
  },
  {
    title: "The post can't be found",
    message: "This post could not be found. It may have been deleted or the link is incorrect.",
    fix: <>Check that the post still opens on Instagram. If it does, copy its link again — part of it may be missing.</>,
  },
  {
    title: "Too many requests",
    message: "Too many requests. Please try again in …",
    fix: <>One connection can only make so many requests in a short time. The message ends with how long to wait — a minute, or a number of minutes.</>,
  },
  {
    title: "A download fails or takes too long",
    message: "Could not download this media right now. Please try again.",
    fix: (
      <>
        Wait a moment and try again — the servers may be busy. If the site says it couldn&apos;t reach the{" "}
        {siteConfig.name} servers, check your internet connection first.
      </>
    ),
  },
  {
    title: "Only one item of a carousel was saved",
    message: null,
    fix: <>Download saves the item on screen. Move to the next photo or video with the arrows or dots and press Download again for each one.</>,
  },
];

const SECTIONS = [
  { id: "downloads", label: "What you can download" },
  { id: "how-it-works", label: "Quality and privacy" },
  { id: "devices", label: "Phones and computers" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-muted px-1.5 py-0.5 font-sans text-[0.8125rem] font-medium text-foreground">
      {children}
    </code>
  );
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-orange/15 via-brand-pink/15 to-brand-violet/20 text-primary ring-1 ring-inset ring-primary/20">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow: string; title: string; intro: string }) {
  return (
    <div {...reveal()} className="flex max-w-2xl flex-col gap-2">
      <span className="text-eyebrow uppercase text-primary">{eyebrow}</span>
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      <p className="text-body text-muted-foreground">{intro}</p>
    </div>
  );
}

function FeatureCard({ feature, order }: { feature: Feature; order: number }) {
  return (
    <Card {...reveal(order)} className="flex min-w-0 flex-col gap-4 p-6">
      <IconBadge icon={feature.icon} />
      <div className="flex flex-col gap-2">
        <h3 className="text-h3">{feature.title}</h3>
        <p className="text-body text-muted-foreground">{feature.body}</p>
      </div>
    </Card>
  );
}

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="container relative overflow-hidden pb-6 pt-12 text-center sm:pt-16">
          {/* The homepage hero's glow, so the two pages read as one site. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(closest-side_at_50%_30%,hsl(var(--brand-violet)/0.06),transparent),radial-gradient(closest-side_at_30%_35%,hsl(var(--brand-pink)/0.05),transparent_70%)] dark:bg-[radial-gradient(closest-side_at_50%_30%,hsl(var(--brand-violet)/0.38),transparent),radial-gradient(closest-side_at_30%_35%,hsl(var(--brand-pink)/0.18),transparent_70%)]"
          />
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground/80 shadow-sm">
              <LifeBuoy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Support
            </span>
            <h1 className="text-h1 sm:text-[clamp(2.25rem,1.6rem+2vw,3.25rem)]">
              How can we <span className="text-brand-gradient">help?</span>
            </h1>
            <p className="max-w-2xl text-lead text-muted-foreground">
              Everything {siteConfig.name} can download, how to use it on any device, and what to try when a link
              or a download doesn&apos;t work.
            </p>
          </div>

          <nav aria-label="On this page" className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground/85 shadow-sm transition-colors duration-150 ease-out hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </section>

        <section aria-labelledby="downloads-heading" id="downloads" className="container scroll-mt-20 py-12 sm:py-14">
          <SectionHeading
            id="downloads-heading"
            eyebrow="Services"
            title="What you can download"
            intro="Public posts on Instagram, in four kinds. Every one works the same way: paste the link, check the preview, press Download."
          />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:gap-8 2xl:grid-cols-4">
            {DOWNLOADS.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} order={(index % 4) + 1} />
            ))}
          </div>
        </section>

        <section aria-labelledby="how-it-works-heading" id="how-it-works" className="container scroll-mt-20 py-12 sm:py-14">
          <SectionHeading
            id="how-it-works-heading"
            eyebrow="Features"
            title="Quality and privacy"
            intro="What you can count on with every download."
          />
          <div className="mt-8 grid gap-5 md:grid-cols-3 lg:gap-8">
            {PROMISES.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} order={index + 1} />
            ))}
          </div>
        </section>

        <section aria-labelledby="devices-heading" id="devices" className="container scroll-mt-20 py-12 sm:py-14">
          <SectionHeading
            id="devices-heading"
            eyebrow="Every device"
            title="On phones and computers"
            intro={`${siteConfig.name} runs in the browser, so it works on phones, tablets, laptops and desktops — there is nothing to install.`}
          />
          <div className="mt-8 grid gap-5 lg:grid-cols-2 lg:gap-8">
            {DEVICES.map((device, index) => (
              <Card key={device.title} {...reveal(index + 1)} interactive={false} className="flex min-w-0 flex-col gap-5 p-6">
                <div className="flex items-center gap-3">
                  <IconBadge icon={device.icon} />
                  <h3 className="text-h3">{device.title}</h3>
                </div>
                <ol className="flex flex-col gap-3">
                  {device.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cta-gradient text-xs font-bold text-white shadow-glow"
                      >
                        {stepIndex + 1}
                      </span>
                      <span className="pt-0.5 text-body text-foreground/85">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-auto rounded-md border border-primary/20 bg-primary/[0.05] px-4 py-3 text-sm text-foreground/85">
                  {device.tip}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="troubleshooting-heading" id="troubleshooting" className="container scroll-mt-20 py-12 sm:py-14">
          <SectionHeading
            id="troubleshooting-heading"
            eyebrow="Troubleshooting"
            title="When something doesn't work"
            intro="The message the site shows, what it means, and what to try."
          />
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:gap-8">
            {PROBLEMS.map((problem, index) => (
              <Card key={problem.title} {...reveal((index % 2) + 1)} interactive={false} className="flex min-w-0 flex-col gap-3 p-6">
                <div className="flex items-start gap-3">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <h3 className="text-h3">{problem.title}</h3>
                </div>
                {problem.message ? (
                  <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground/85">
                    <span className="sr-only">The site says: </span>&ldquo;{problem.message}&rdquo;
                  </p>
                ) : null}
                <p className="text-body text-muted-foreground">{problem.fix}</p>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="still-stuck-heading" className="container pb-16 pt-6 sm:pb-20">
          <div
            {...reveal()}
            className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-lg border border-primary/20 bg-card px-6 py-8 text-center shadow-sm"
          >
            <h2 id="still-stuck-heading" className="text-title">
              Still stuck?
            </h2>
            <p className="max-w-xl text-body text-muted-foreground">
              Tell us the link you tried and the message you saw, and we&apos;ll take a look.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/contact"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-cta-gradient px-6 text-sm font-semibold text-white shadow-glow transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Contact us
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/"
                className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors duration-150 ease-out hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Back to the downloader
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
