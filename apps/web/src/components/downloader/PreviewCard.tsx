"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, VolumeX } from "lucide-react";
import type { InstagramPost } from "@reelsavenow/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { MediaViewer } from "@/components/downloader/MediaViewer";
import { buildDownloadFilename, buildDownloadUrl } from "@/lib/downloadUrl";
import { describeFetchFailure } from "@/lib/apiErrors";
import { useToast } from "@/hooks/useToast";

export interface PreviewCardProps {
  post: InstagramPost;
}

/**
 * The API's error responses are JSON envelopes, not media. Reading the
 * real message out of one is what lets this surface "too many requests"
 * instead of writing that envelope to disk as a .mp4 (see handleDownload).
 */
export function PreviewCard({ post }: PreviewCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();
  const slideCount = post.media.length;
  const currentMedia = post.media[slideIndex];

  if (!currentMedia) return null;

  const filename = buildDownloadFilename(post.shortcode, currentMedia, slideIndex, slideCount);

  const goToSlide = (nextIndex: number) => setSlideIndex(((nextIndex % slideCount) + slideCount) % slideCount);

  async function handleDownload() {
    // A video download takes real seconds, during which the button stays
    // clickable; a second click would start a duplicate transfer and spend
    // another request from the download rate limit's budget.
    if (isDownloading || !currentMedia) return;

    const downloadUrl = buildDownloadUrl(currentMedia, filename);
    setIsDownloading(true);

    try {
      const response = await fetch(downloadUrl);

      // Checked before touching the body: a 429/502 from the API is a JSON
      // error envelope, and blindly blob-ing it saved that envelope to the
      // user's disk as reelsavenow_<shortcode>.mp4 - a file that looks
      // like a failed download rather than a rate limit they can wait out.
      if (!response.ok) {
        const failure = await describeFetchFailure(response);
        toast({
          title: response.status === 429 ? "Too many requests" : "Download failed",
          description: failure.message,
          variant: "destructive",
        });
        return;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Only reachable for a transport-level failure (offline, CORS,
      // DNS) - an HTTP error status is handled above. A plain navigation
      // lets the browser perform the download itself, which doesn't need
      // CORS to succeed.
      window.open(downloadUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card interactive={false} className="mx-auto max-w-md text-left animate-fade-in">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <p className="text-sm font-semibold">@{post.author.username || "unknown"}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="relative">
          <MediaViewer media={currentMedia} alt={post.caption || "Instagram media"} />

          {slideCount > 1 ? (
            <>
              <button
                type="button"
                onClick={() => goToSlide(slideIndex - 1)}
                aria-label="Previous slide"
                className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md transition-transform duration-150 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goToSlide(slideIndex + 1)}
                aria-label="Next slide"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md transition-transform duration-150 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                {post.media.map((_, dotIndex) => (
                  <button
                    key={dotIndex}
                    type="button"
                    onClick={() => goToSlide(dotIndex)}
                    aria-label={`Go to slide ${dotIndex + 1}`}
                    aria-current={dotIndex === slideIndex}
                    className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={`h-1.5 rounded-full transition-all duration-200 ease-out ${
                        dotIndex === slideIndex ? "w-4 bg-primary" : "w-1.5 bg-background/60"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Said before the download, not discovered after it: Instagram
            muted this video (usually licensed music) and the API could not
            get it with sound. Instagram's own reason, word for word. */}
        {currentMedia.type === "video" && currentMedia.audioMutedReason ? (
          <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground/85">
            <VolumeX className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-semibold text-foreground">This video will download without sound.</span>{" "}
              Instagram has muted it: &ldquo;{currentMedia.audioMutedReason}&rdquo;
            </span>
          </p>
        ) : null}

        {post.caption ? (
          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
            {post.caption}
          </p>
        ) : null}

        <Button type="button" onClick={handleDownload} disabled={isDownloading} className="w-full">
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Downloading…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download {currentMedia.type === "video" ? "video" : "photo"}
              {slideCount > 1 ? ` (${slideIndex + 1}/${slideCount})` : ""}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
