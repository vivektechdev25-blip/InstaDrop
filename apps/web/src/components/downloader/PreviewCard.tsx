"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { InstagramPost } from "@instadrop/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { MediaViewer } from "@/components/downloader/MediaViewer";
import { buildDownloadFilename, buildDownloadUrl } from "@/lib/downloadUrl";

export interface PreviewCardProps {
  post: InstagramPost;
}

export function PreviewCard({ post }: PreviewCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const slideCount = post.media.length;
  const currentMedia = post.media[slideIndex];

  if (!currentMedia) return null;

  const filename = buildDownloadFilename(post.shortcode, currentMedia, slideIndex, slideCount);
  const downloadUrl = buildDownloadUrl(currentMedia, filename);

  function goToSlide(nextIndex: number) {
    setSlideIndex(((nextIndex % slideCount) + slideCount) % slideCount);
  }

  return (
    <Card className="mx-auto max-w-md text-left animate-fade-in">
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

        {post.caption ? (
          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
            {post.caption}
          </p>
        ) : null}

        <Button asChild className="w-full">
          <a href={downloadUrl}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download {currentMedia.type === "video" ? "video" : "photo"}
            {slideCount > 1 ? ` (${slideIndex + 1}/${slideCount})` : ""}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
