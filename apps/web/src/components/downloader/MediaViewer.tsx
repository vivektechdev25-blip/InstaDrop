"use client";

import { useState } from "react";
import type { MediaItem } from "@reelsavehub/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export interface MediaViewerProps {
  media: MediaItem;
  alt: string;
}

// Reels/portrait posts are the common case; falls back to this when the
// scraper couldn't determine real dimensions (width/height come back 0)
// rather than leaving no aspect-ratio at all, which let the container
// collapse to zero height and pop open once content loaded - a real,
// visible layout shift.
const FALLBACK_ASPECT_RATIO = 9 / 16;

export function MediaViewer({ media, alt }: MediaViewerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const { width, height } = media.dimensions;
  const aspectRatio = width > 0 && height > 0 ? width / height : FALLBACK_ASPECT_RATIO;

  if (media.type === "video") {
    // No skeleton/opacity-gating here on purpose - the video element's own
    // `poster` attribute already shows an instant placeholder image
    // natively, before the video data itself loads. Gating the whole
    // <video> element's opacity on a loaded-data event would hide that
    // poster too, trading a fast native placeholder for a slower, worse one.
    return (
      <div
        className="relative max-h-[70vh] w-full overflow-hidden rounded-md bg-black"
        style={{ aspectRatio }}
      >
        <video controls playsInline poster={media.thumbnail} className="h-full w-full">
          <source src={media.url} type="video/mp4" />
        </video>
      </div>
    );
  }

  // object-contain (not cover) so the full image is visible - this is a
  // pre-download preview, not a gallery thumbnail, so cropping would
  // misrepresent what the user is about to download.
  return (
    <div
      className="relative max-h-[70vh] w-full overflow-hidden rounded-md bg-muted"
      style={{ aspectRatio }}
    >
      {!isLoaded ? <Skeleton className="absolute inset-0 rounded-md" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Instagram CDN URLs, not a local asset */}
      <img
        src={media.url}
        alt={alt}
        onLoad={() => setIsLoaded(true)}
        className={cn(
          "h-full w-full object-contain transition-opacity duration-200 ease-out",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
