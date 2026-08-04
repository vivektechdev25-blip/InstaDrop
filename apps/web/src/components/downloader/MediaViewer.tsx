import type { MediaItem } from "@instadrop/types";

export interface MediaViewerProps {
  media: MediaItem;
  alt: string;
}

export function MediaViewer({ media, alt }: MediaViewerProps) {
  if (media.type === "video") {
    return (
      <video
        controls
        playsInline
        poster={media.thumbnail}
        className="max-h-[70vh] w-full rounded-lg bg-black"
      >
        <source src={media.url} type="video/mp4" />
      </video>
    );
  }

  // object-contain (not cover) so the full image is visible - this is a
  // pre-download preview, not a gallery thumbnail, so cropping would
  // misrepresent what the user is about to download.
  return (
    <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Instagram CDN URLs, not a local asset */}
      <img src={media.url} alt={alt} className="max-h-[70vh] w-full object-contain" />
    </div>
  );
}
