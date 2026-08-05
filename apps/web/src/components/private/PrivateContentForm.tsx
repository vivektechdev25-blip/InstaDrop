"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { CookieHelpGuide } from "@/components/private/CookieHelpGuide";
import { usePrivateContentFetch } from "@/hooks/usePrivateContentFetch";
import { useToast } from "@/hooks/useToast";

// Same reasoning as InputForm.tsx: not needed until a fetch actually
// succeeds, kept out of the initial bundle for this page too.
const PreviewCard = dynamic(
  () => import("@/components/downloader/PreviewCard").then((mod) => mod.PreviewCard),
  { ssr: false }
);

const TOAST_TITLES: Record<string, string> = {
  SESSION_EXPIRED: "Session expired",
  ACCESS_DENIED: "Not your content",
  RATE_LIMITED: "Too many requests",
};

export function PrivateContentForm() {
  const [sessionCookie, setSessionCookie] = useState("");
  const [url, setUrl] = useState("");
  const [isCookieVisible, setIsCookieVisible] = useState(false);
  const { toast } = useToast();
  const { status, post, errorMessage, submit } = usePrivateContentFetch();
  const lastAnnouncedError = useRef<string | null>(null);

  const isFetching = status === "FETCHING" || status === "VALIDATING";
  const isErrorState =
    status === "ERROR" ||
    status === "RATE_LIMITED" ||
    status === "SESSION_EXPIRED" ||
    status === "ACCESS_DENIED";

  useEffect(() => {
    if (!isErrorState || !errorMessage || errorMessage === lastAnnouncedError.current) return;

    lastAnnouncedError.current = errorMessage;
    toast({
      title: TOAST_TITLES[status] ?? "Couldn't fetch this content",
      description: errorMessage,
      variant: "destructive",
    });
  }, [status, errorMessage, isErrorState, toast]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionCookie.trim() || !url.trim() || isFetching) return;
    void submit(sessionCookie, url);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="session-cookie" className="text-sm font-medium">
            Your session cookie
          </label>
          <div className="relative">
            <Input
              id="session-cookie"
              // Masked like a password field - it functions like one for
              // this purpose, even though it isn't literally your Instagram
              // password. data-1p-ignore/data-lpignore opt this field out
              // of 1Password/LastPass's auto-save prompts, since a browser
              // extension offering to "save this password" for a live
              // session credential tied to the wrong site would be a
              // confusing, mildly risky footgun.
              type={isCookieVisible ? "text" : "password"}
              autoComplete="off"
              data-1p-ignore=""
              data-lpignore="true"
              placeholder="Paste your sessionid value"
              value={sessionCookie}
              onChange={(event) => setSessionCookie(event.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setIsCookieVisible((visible) => !visible)}
              aria-label={isCookieVisible ? "Hide cookie value" : "Show cookie value"}
              className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isCookieVisible ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <CookieHelpGuide />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="private-content-url" className="text-sm font-medium">
            Your Reel or post link
          </label>
          <Input
            id="private-content-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.instagram.com/reel/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-describedby={errorMessage ? "private-content-error" : undefined}
            aria-invalid={isErrorState}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isFetching || !sessionCookie.trim() || !url.trim()}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Fetch my content
        </Button>
      </form>

      {isErrorState && errorMessage ? (
        <p id="private-content-error" role="alert" className="text-left text-sm text-destructive">
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
