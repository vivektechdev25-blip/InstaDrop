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

const downloadButton = () => screen.getByRole("button", { name: /download|downloading/i });

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
