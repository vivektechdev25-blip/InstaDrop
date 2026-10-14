"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ClipboardPaste, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useClipboard } from "@/hooks/useClipboard";
import { useInstagramDownloader } from "@/hooks/useInstagramDownloader";
import { useToast } from "@/hooks/useToast";

// Not needed until a fetch actually succeeds - keep it out of the
// initial page bundle rather than paying for the carousel/download-link
// logic on every visit, most of which never reach SUCCESS.
const PreviewCard = dynamic(
  () => import("@/components/downloader/PreviewCard").then((mod) => mod.PreviewCard),
  { ssr: false }
);

export interface InputFormProps {
  /**
   * Pre-fills the input and auto-submits once, for the ?url= and
   * catch-all entry points - goes through the same VALIDATING/FETCHING
   * states as a manual paste, not a silent background fetch.
   */
  initialUrl?: string;
}

export function InputForm({ initialUrl }: InputFormProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const { readText } = useClipboard();
  const { toast } = useToast();
  const { status, post, errorMessage, submit } = useInstagramDownloader();
  // Toasts are deduplicated per submission, not per message text. Keying
  // on the text (as this used to) meant retrying the same failing link -
  // the most natural thing to do after an error - produced no toast at
  // all, so the retry looked like it hadn't happened.
  const [submissionCount, setSubmissionCount] = useState(0);
  const lastAnnouncedSubmission = useRef(0);
  const hasAutoSubmitted = useRef(false);

  const isFetching = status === "FETCHING" || status === "VALIDATING";

  function startSubmission(rawUrl: string) {
    setSubmissionCount((count) => count + 1);
    void submit(rawUrl);
  }

  useEffect(() => {
    if (!initialUrl || hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;
    setSubmissionCount((count) => count + 1);
    void submit(initialUrl);
  }, [initialUrl, submit]);

  useEffect(() => {
    if (status !== "ERROR" && status !== "RATE_LIMITED") return;
    if (!errorMessage || lastAnnouncedSubmission.current === submissionCount) return;

    lastAnnouncedSubmission.current = submissionCount;
    toast({
      title: status === "RATE_LIMITED" ? "Too many requests" : "Couldn't fetch this link",
      description: errorMessage,
      variant: "destructive",
    });
  }, [status, errorMessage, submissionCount, toast]);

  async function handlePasteFromClipboard() {
    const clipboardText = await readText();
    if (clipboardText) {
      setUrl(clipboardText);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || isFetching) return;
    startSubmission(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="instagram-url" className="sr-only">
            Instagram post, reel, or video URL
          </label>
          <Input
            id="instagram-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="Paste an Instagram post, reel, or video link"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-describedby={errorMessage ? "instagram-url-error" : undefined}
            aria-invalid={status === "ERROR"}
            // Scoped to the hero only via className override (twMerge, not
            // a change to Input's own defaults) - /private's form reuses
            // this same component at its normal size and shouldn't grow
            // as a side effect of this pass.
            className="h-14 pl-5 pr-14 text-base"
          />
          {/* h-12 w-12 (48px) - still clears the 44px WCAG 2.5.5 / Apple
              HIG touch-target minimum, sized up from 44px to stay
              proportional to the taller h-14 input around it. */}
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            aria-label="Paste from clipboard"
            className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ClipboardPaste className="h-4 w-4" />
          </button>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isFetching || !url.trim()}
          className="h-14 px-9 text-base [&_svg]:h-5 [&_svg]:w-5"
        >
          {isFetching ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Search aria-hidden="true" />
          )}
          Download
        </Button>
      </form>

      {/* One element for both error states: the input's aria-describedby
          points at this id whenever there's an errorMessage, and the
          rate-limited variant used to render without it - a dangling
          reference for screen readers. */}
      {(status === "ERROR" || status === "RATE_LIMITED") && errorMessage ? (
        <p id="instagram-url-error" role="alert" className="text-left text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isFetching ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : null}

      {status === "SUCCESS" && post ? <PreviewCard post={post} /> : null}
    </div>
  );
}
