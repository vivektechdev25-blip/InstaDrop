"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ClipboardPaste, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useClipboard } from "@/hooks/useClipboard";
import { useInstagramDownloader } from "@/hooks/useInstagramDownloader";
import { useToast } from "@/hooks/useToast";

export function InputForm() {
  const [url, setUrl] = useState("");
  const { readText } = useClipboard();
  const { toast } = useToast();
  const { status, errorMessage, submit } = useInstagramDownloader();
  const lastAnnouncedError = useRef<string | null>(null);

  const isFetching = status === "FETCHING" || status === "VALIDATING";

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
            className="pr-11"
          />
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            aria-label="Paste from clipboard"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
    </div>
  );
}
