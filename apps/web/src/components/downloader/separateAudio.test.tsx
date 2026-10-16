import { cleanup, fireEvent, render } from "@testing-library/react";
import type { MediaItem } from "@reelsavenow/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaViewer } from "@/components/downloader/MediaViewer";
import { buildDownloadUrl } from "@/lib/downloadUrl";

afterEach(cleanup);

const silentVideo: MediaItem = {
  type: "video",
  url: "https://scontent.cdninstagram.com/v.mp4",
  thumbnail: "https://scontent.cdninstagram.com/t.jpg",
  dimensions: { width: 720, height: 1280 },
  audioUrl: "https://instagram.fdel27-6.fna.fbcdn.net/a.mp4",
};

describe("a video whose sound is a separate stream", () => {
  it("asks the API to join the audio into the download", () => {
    const params = new URL(buildDownloadUrl(silentVideo, "reel.mp4"), "https://site.test").searchParams;
    expect(params.get("url")).toBe(silentVideo.url);
    expect(params.get("audio")).toBe(silentVideo.audioUrl);
  });

  it("leaves the download URL as it was when the video has its own sound", () => {
    const { audioUrl: _omit, ...muxed } = silentVideo;
    const params = new URL(buildDownloadUrl(muxed, "reel.mp4"), "https://site.test").searchParams;
    expect(params.has("audio")).toBe(false);
  });

  it("plays the separate audio in the preview, following the video", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(<MediaViewer media={silentVideo} alt="" />);
    const video = container.querySelector("video")!;
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe(silentVideo.audioUrl);

    Object.defineProperty(video, "paused", { configurable: true, get: () => false });
    fireEvent.play(video);
    expect(play).toHaveBeenCalled();

    Object.defineProperty(video, "paused", { configurable: true, get: () => true });
    fireEvent.pause(video);
    expect(pause).toHaveBeenCalled();
  });

  it("renders no extra audio element for an ordinary video", () => {
    const { audioUrl: _omit, ...muxed } = silentVideo;
    const { container } = render(<MediaViewer media={muxed} alt="" />);
    expect(container.querySelector("audio")).toBeNull();
  });
});
