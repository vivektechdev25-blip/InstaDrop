import type { ReactNode } from "react";
import { ClipboardPaste } from "lucide-react";
import { AddressBarExample } from "@/components/marketing/AddressBarExample";
import { reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/*
 * How to get a link out of Instagram and into ReelSaveNow, one block per
 * way people actually do it. "How it works" above is the three-step
 * overview of this site; this is the part that overview skips - where the
 * link comes from.
 *
 * Each method shows a device photo generated for this site, in the brand
 * colours; the address-bar method lays the exact text to type over its photo
 * as real text. None of them carries an
 * Instagram screenshot, logo, Meta mark or a copy of Instagram's own screens
 * - the site says it is not affiliated with Instagram, and its pages should
 * not look as if it were. Each is a labelled image, so a screen reader hears
 * a one-line description; the numbered steps beside it carry the actual
 * instructions. A server component: no client JavaScript.
 */

interface Method {
  id: string;
  label: string;
  title: string;
  intro: string;
  steps: ReactNode[];
  illustration: ReactNode;
  illustrationLabel: string;
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-sans text-[0.8125rem] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

/**
 * A product photo for a method, generated for this site (Figma AI) and
 * served from public/guide as WebP in two widths: 720px for phones, 1280px
 * for wider screens. Plain <img> - the image optimizer is off (next.config)
 * - with its intrinsic size set so nothing shifts as it loads, and lazy, as
 * it sits well below the fold. alt is empty because the wrapper in
 * DownloadGuide carries the description as a labelled image. children are
 * laid over the photo.
 */
function GuidePhoto({ name, children }: { name: "phone" | "laptop" | "shortcut"; children?: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized local photo */}
      <img
        src={`/guide/${name}-1280.webp`}
        srcSet={`/guide/${name}-720.webp 720w, /guide/${name}-1280.webp 1280w`}
        sizes="(min-width: 1024px) 560px, calc(100vw - 3rem)"
        width={1280}
        height={960}
        alt=""
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-lg border border-border shadow-[0_26px_50px_-24px_hsl(var(--brand-violet)/0.45)]"
      />
      {children}
    </div>
  );
}

/**
 * The shortcut photo, with the exact text to type laid over its address bar
 * as real text: a generated image can't be trusted to spell, and this is the
 * one method whose point is the words.
 */
function AddressBarIllustration() {
  return (
    <GuidePhoto name="shortcut">
      <div className="absolute inset-x-[5%] top-[9%] flex items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-[0_18px_40px_-16px_hsl(var(--brand-violet)/0.5)] sm:gap-3 sm:p-2.5">
        <AddressBarExample />
        <span className="shrink-0">
          <Key>Enter ↵</Key>
        </span>
      </div>
    </GuidePhoto>
  );
}

// Keyboard shortcuts differ by platform (Ctrl+V, Cmd+V), so the step points
// at the paste button in the input instead of naming one.
const PASTE_AND_DOWNLOAD = (
  <>
    Come back here, paste the link with the{" "}
    <ClipboardPaste aria-hidden="true" className="inline h-4 w-4 align-[-3px] text-primary" />
    <span className="sr-only">paste</span> button and press{" "}
    <strong className="font-semibold text-foreground">Download</strong>.
  </>
);

const METHODS: Method[] = [
  {
    id: "phone",
    label: "Method 1",
    title: "From the Instagram app",
    intro: "On your phone — the quickest way.",
    steps: [
      "Open the Reel, photo or carousel you want to save.",
      <>
        Tap the <strong className="font-semibold text-foreground">Share</strong> icon — the paper plane under
        the post.
      </>,
      <>
        Choose <strong className="font-semibold text-foreground">Copy link</strong>.
      </>,
      <>
        Open ReelSaveNow, paste the link and tap <strong className="font-semibold text-foreground">Download</strong>.
      </>,
    ],
    illustration: <GuidePhoto name="phone" />,
    illustrationLabel:
      "Illustration: a hand holding a phone with a video preview and a download button on screen",
  },
  {
    id: "desktop",
    label: "Method 2",
    title: "On a computer",
    intro: "In any desktop browser.",
    steps: [
      "Open the post on instagram.com.",
      <>
        Click the <strong className="font-semibold text-foreground">⋯</strong> menu at the top of the post.
      </>,
      <>
        Choose <strong className="font-semibold text-foreground">Copy link</strong> — or copy the address from
        the address bar.
      </>,
      PASTE_AND_DOWNLOAD,
    ],
    illustration: <GuidePhoto name="laptop" />,
    illustrationLabel:
      "Illustration: a laptop on a desk with a video preview and a download button in the browser",
  },
  {
    id: "shortcut",
    label: "Method 3",
    title: "The address-bar shortcut",
    intro: "Skip the copy and paste entirely.",
    steps: [
      "Open the post in your browser.",
      <>
        Click the address bar and type <strong className="font-semibold text-primary">reelsavenow.com/</strong>{" "}
        in front of the link.
      </>,
      <>
        Press <Key>Enter</Key> — you land straight on the preview, ready to download.
      </>,
    ],
    illustration: <AddressBarIllustration />,
    illustrationLabel:
      "Illustration: hands typing on a laptop, its address bar reading reelsavenow.com/ followed by an Instagram link, then Enter",
  },
];

export function DownloadGuide() {
  return (
    <section aria-labelledby="guide-heading" className="container py-12 sm:py-16">
      <div {...reveal()} className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <span className="text-eyebrow uppercase text-primary">Step-by-step guide</span>
        <h2 id="guide-heading" className="text-h2">
          How to download an Instagram <span className="text-brand-gradient">Reel</span>
        </h2>
        <p className="max-w-xl text-body text-muted-foreground">
          Every download starts with the post&apos;s link. Here is how to get it, wherever you are.
        </p>
      </div>

      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-16 sm:mt-14 lg:gap-24">
        {METHODS.map((method, index) => (
          <article
            key={method.id}
            aria-labelledby={`guide-${method.id}`}
            // grid-cols-1 is minmax(0, 1fr): without it the single mobile column
            // grows to the illustration natural width (460px) and the page
            // scrolls sideways on a phone.
            className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16"
          >
            <div
              {...reveal(1)}
              role="img"
              aria-label={method.illustrationLabel}
              className={cn("w-full", index % 2 === 1 && "lg:order-2")}
            >
              {method.illustration}
            </div>

            <div className="flex flex-col gap-4">
              <div {...reveal(1)} className="flex flex-col gap-2">
                <span className="w-fit rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-eyebrow uppercase text-primary">
                  {method.label}
                </span>
                <h3 id={`guide-${method.id}`} className="text-title">
                  {method.title}
                </h3>
                <p className="text-body text-muted-foreground">{method.intro}</p>
              </div>

              <ol className="flex flex-col gap-3">
                {method.steps.map((step, stepIndex) => (
                  <li
                    key={stepIndex}
                    {...reveal(stepIndex + 2)}
                    className="flex items-start gap-3 rounded-md border border-border bg-card p-3.5 shadow-sm"
                  >
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
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
