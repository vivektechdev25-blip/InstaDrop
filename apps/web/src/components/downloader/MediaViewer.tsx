"use client";

import { useRef, useState } from "react";
import type { MediaItem } from "@reelsavenow/types";
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

/**
 * A video-only file played with its sound from a separate stream, so the
 * preview is not silent when the download will have audio. The video's own
 * controls drive the audio: play, pause, seek, speed and volume follow it.
 */
function VideoWithSeparateAudio({ src, audioSrc, poster }: { src: string; audioSrc: string; poster: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const follow = (video: HTMLVideoElement) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = video.muted;
    audio.volume = video.volume;
    audio.playbackRate = video.playbackRate;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.3) audio.currentTime = video.currentTime;
    if (video.paused) audio.pause();
    else void audio.play().catch(() => {});
  };

  return (
    <>
      <video
        controls
        playsInline
        poster={poster}
        className="h-full w-full"
        onPlay={(event) => follow(event.currentTarget)}
        onPause={(event) => follow(event.currentTarget)}
        onSeeked={(event) => follow(event.currentTarget)}
        onRateChange={(event) => follow(event.currentTarget)}
        onVolumeChange={(event) => follow(event.currentTarget)}
        onWaiting={() => audioRef.current?.pause()}
        onPlaying={(event) => follow(event.currentTarget)}
        onEnded={() => audioRef.current?.pause()}
      >
        <source src={src} type="video/mp4" />
      </video>
      <audio ref={audioRef} src={audioSrc} preload="auto" aria-hidden="true" className="hidden" />
    </>
  );
}

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
        {media.audioUrl ? (
          <VideoWithSeparateAudio src={media.url} audioSrc={media.audioUrl} poster={media.thumbnail} />
        ) : (
          <video controls playsInline poster={media.thumbnail} className="h-full w-full">
            <source src={media.url} type="video/mp4" />
          </video>
        )}
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
