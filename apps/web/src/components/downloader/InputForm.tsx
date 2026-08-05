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
  const lastAnnouncedError = useRef<string | null>(null);
  const hasAutoSubmitted = useRef(false);

  const isFetching = status === "FETCHING" || status === "VALIDATING";

  useEffect(() => {
    if (!initialUrl || hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;
    void submit(initialUrl);
  }, [initialUrl, submit]);

  useEffect(() => {
    if (status !== "ERROR" && status !== "RATE_LIMITED") return;
    if (!errorMessage || errorMessage === lastAnnouncedError.current) return;

    lastAnnouncedError.current = errorMessage;
    toast({
      title: status === "RATE_LIMITED" ? "Too many requests" : "Couldn't fetch this link",
      description: errorMessage,
      variant: "destructive",
    });
  }, [status, errorMessage, toast]);

  async function handlePasteFromClipboard() {
    const clipboardText = await readText();
    if (clipboardText) {
      setUrl(clipboardText);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || isFetching) return;
    void submit(url);
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
            className="pr-12"
          />
          {/* h-11 w-11 (44px) - confirmed live via a responsive screenshot
              check that the previous 36x36 size fell short of the WCAG
              2.5.5 / Apple HIG 44x44 touch-target minimum. */}
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            aria-label="Paste from clipboard"
            className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ClipboardPaste className="h-4 w-4" />
          </button>
        </div>

        <Button type="submit" size="lg" disabled={isFetching || !url.trim()}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Download
        </Button>
      </form>

      {status === "ERROR" && errorMessage ? (
        <p id="instagram-url-error" role="alert" className="text-left text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {status === "RATE_LIMITED" && errorMessage ? (
        <p role="alert" className="text-left text-sm text-destructive">
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
