import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { InstagramPost } from "@reelsavenow/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewCard } from "@/components/downloader/PreviewCard";
import { Toaster } from "@/components/ui/Toaster";
import { ToastProvider } from "@/hooks/useToast";
import { buildDownloadFilename, buildDownloadUrl } from "@/lib/downloadUrl";

const reel: InstagramPost = {
  id: "ABC123",
  shortcode: "ABC123",
  caption: "a reel",
  author: { username: "creator", full_name: "Creator" },
  media: [
    {
      type: "video",
      url: "https://instagram.fdel27-4.fna.fbcdn.net/o1/v/t2/reel.mp4?efg=x",
      thumbnail: "https://scontent.cdninstagram.com/v/thumb.jpg",
      dimensions: { width: 720, height: 1280 },
    },
  ],
};

const carousel: InstagramPost = {
  ...reel,
  media: [
    { type: "image", url: "https://scontent.cdninstagram.com/v/1.jpg", thumbnail: "t1", dimensions: { width: 1, height: 1 } },
    { type: "image", url: "https://scontent.cdninstagram.com/v/2.jpg", thumbnail: "t2", dimensions: { width: 1, height: 1 } },
  ],
};

function renderCard(post: InstagramPost = reel) {
  return render(
    <ToastProvider>
      <PreviewCard post={post} />
      <Toaster />
    </ToastProvider>
  );
}

// The video/photo button - not "Download Audio (MP3)" beside it.
const downloadButton = () => screen.getByRole("button", { name: /^(download (video|photo)|downloading)/i });

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.fn>;
let savedFilenames: string[];
let openWindow: ReturnType<typeof vi.fn>;

beforeEach(() => {
  savedFilenames = [];
  createObjectURL = vi.fn(() => "blob:mock");
  revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  anchorClick = vi.fn(function (this: HTMLAnchorElement) {
    savedFilenames.push(this.download);
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(anchorClick);
  openWindow = vi.fn();
  vi.stubGlobal("open", openWindow);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PreviewCard download", () => {
  it("saves the file under the expected filename on success", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["mp4-bytes"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(downloadButton());

    await waitFor(() => expect(savedFilenames).toEqual(["reelsavenow_ABC123.mp4"]));
    expect(fetchMock).toHaveBeenCalledWith(
      buildDownloadUrl(reel.media[0]!, buildDownloadFilename("ABC123", reel.media[0]!, 0, 1))
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  // Regression: the error envelope used to be blob-saved as the .mp4.
  it("shows the API's message and saves nothing when the response is an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { success: false, message: "Too many requests. Please try again later.", data: null, errors: null, code: "RATE_LIMITED" },
          { status: 429 }
        )
      )
    );
    renderCard();

    fireEvent.click(downloadButton());

    expect(await screen.findByText("Too many requests")).toBeTruthy();
    expect(screen.getByText("Too many requests. Please try again later.")).toBeTruthy();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("falls back to a status-based message for a non-JSON error page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
    renderCard();

    fireEvent.click(downloadButton());

    expect(await screen.findByText("Download failed")).toBeTruthy();
    expect(screen.getByText("The server took too long to respond. Please try again.")).toBeTruthy();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("lets the browser download directly when the request can't be made at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    renderCard();

    fireEvent.click(downloadButton());

    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1));
    expect(openWindow).toHaveBeenCalledWith(
      buildDownloadUrl(reel.media[0]!, "reelsavenow_ABC123.mp4"),
      "_blank"
    );
  });

  it("starts exactly one transfer on a double-click and disables the button meanwhile", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(downloadButton());
    fireEvent.click(downloadButton());

    await waitFor(() => expect(downloadButton()).toHaveProperty("disabled", true));
    expect(downloadButton().textContent).toContain("Downloading");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => finish(new Response(new Blob(["x"]), { status: 200 })));
    await waitFor(() => expect(downloadButton()).toHaveProperty("disabled", false));
  });

  it("names carousel slides by position", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["jpg"]), { status: 200 })));
    renderCard(carousel);

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    fireEvent.click(downloadButton());

    await waitFor(() => expect(savedFilenames).toEqual(["reelsavenow_ABC123_2.jpg"]));
    expect(downloadButton().textContent).toContain("(2/2)");
  });
});

describe("PreviewCard - rapid clicks", () => {
  // The reported crash began with a burst of clicks. React flushes state
  // between discrete events, so the isDownloading guard holds; this pins it
  // so a refactor cannot quietly reintroduce twenty transfers.
  it("starts one transfer however many times the button is clicked", async () => {
    let finish!: () => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(new Response(new Blob(["mp4-bytes"]), { status: 200 }));
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    const button = downloadButton();
    for (let click = 0; click < 20; click += 1) fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(savedFilenames).toEqual(["reelsavenow_ABC123.mp4"]));
  });

  it("allows another download once the first has finished", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["mp4-bytes"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(downloadButton());
    await waitFor(() => expect(savedFilenames).toHaveLength(1));
    fireEvent.click(downloadButton());
    await waitFor(() => expect(savedFilenames).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tells the user how long to wait when the download limit is hit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429, headers: { "retry-after": "420" } }))
    );
    renderCard();

    fireEvent.click(downloadButton());
    expect(await screen.findByText("Too many requests. Please try again in 7 minutes.")).toBeTruthy();
  });
});

describe("PreviewCard - a video Instagram muted", () => {
  const reason = "This music can't be played due to recent licensing changes with the rights holder.";

  it("says so before the download, with Instagram's own reason", () => {
    renderCard({ ...reel, media: [{ ...reel.media[0]!, audioMutedReason: reason }] });
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("This video will download without sound.");
    expect(note.textContent).toContain(reason);
    // The download itself is still offered.
    expect(downloadButton()).toBeTruthy();
  });

  it("shows nothing for a video with sound", () => {
    renderCard();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("PreviewCard - Download Audio (MP3)", () => {
  const audioButton = () => screen.getByRole("button", { name: /download audio \(mp3\)|converting to mp3/i });
  const requested = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => new URL(String(fetchMock.mock.calls[call]![0]));
  const apiError = (status: number, code: string, message: string) =>
    Response.json({ success: false, message, data: null, errors: null, code }, { status });

  it("is offered for a video, and not for photos", () => {
    renderCard();
    expect(audioButton()).toBeTruthy();
    cleanup();

    renderCard(carousel);
    expect(screen.queryByRole("button", { name: /download audio/i })).toBeNull();
  });

  it("asks the API for an MP3 and saves it under an .mp3 name", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["mp3-bytes"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(audioButton());

    await waitFor(() => expect(savedFilenames).toEqual(["reelsavenow_ABC123.mp3"]));
    const url = requested(fetchMock);
    expect(url.searchParams.get("format")).toBe("mp3");
    expect(url.searchParams.get("url")).toBe(reel.media[0]!.url);
    expect(url.searchParams.get("filename")).toBe("reelsavenow_ABC123.mp3");
  });

  it("passes the separate audio stream along when the reel has one", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["mp3-bytes"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const audioUrl = "https://instagram.fdel27-4.fna.fbcdn.net/o1/v/t2/audio.mp4";
    renderCard({ ...reel, media: [{ ...reel.media[0]!, audioUrl }] });

    fireEvent.click(audioButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requested(fetchMock).searchParams.get("audio")).toBe(audioUrl);
  });

  it("shows that it is converting, and starts one request however often it is clicked", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(audioButton());
    fireEvent.click(audioButton());

    await waitFor(() => expect(audioButton()).toHaveProperty("disabled", true));
    expect(audioButton().textContent).toContain("Converting to MP3");
    expect(audioButton().getAttribute("aria-busy")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => finish(new Response(new Blob(["x"]), { status: 200 })));
    await waitFor(() => expect(audioButton()).toHaveProperty("disabled", false));
    expect(audioButton().textContent).toContain("Download Audio (MP3)");
  });

  it.each([
    ["the reel has no audio", 422, "NO_AUDIO", "This reel has no audio to download."],
    ["the conversion fails", 502, "SERVER_ERROR", "We couldn't convert the audio. Please try again."],
  ])("says so, and saves nothing, when %s", async (_label, status, code, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => apiError(status, code, message)));
    renderCard();

    fireEvent.click(audioButton());

    expect(await screen.findByText("Audio download failed")).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
    await waitFor(() => expect(audioButton()).toHaveProperty("disabled", false));
  });

  // Instagram muted it: there is no sound to save, and the reason is on screen.
  it("is disabled, pointing at Instagram's reason, for a reel Instagram muted", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const reason = "This music can't be played due to recent licensing changes with the rights holder.";
    renderCard({ ...reel, media: [{ ...reel.media[0]!, audioMutedReason: reason }] });

    const button = audioButton();
    expect(button).toHaveProperty("disabled", true);
    const note = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(note?.textContent).toContain(reason);

    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves the video download working while the audio converts", async () => {
    const fetchMock = vi.fn((input: string) =>
      new URL(input).searchParams.get("format") === "mp3"
        ? new Promise<Response>(() => {})
        : Promise.resolve(new Response(new Blob(["mp4-bytes"]), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.click(audioButton());
    await waitFor(() => expect(audioButton()).toHaveProperty("disabled", true));
    fireEvent.click(downloadButton());

    await waitFor(() => expect(savedFilenames).toEqual(["reelsavenow_ABC123.mp4"]));
    expect(requested(fetchMock, 1).searchParams.get("format")).toBeNull();
  });
});
