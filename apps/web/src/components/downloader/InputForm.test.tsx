import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { InstagramPost } from "@reelsavenow/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputForm } from "@/components/downloader/InputForm";
import { Toaster } from "@/components/ui/Toaster";
import { ToastProvider } from "@/hooks/useToast";
import { apiClient } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({ apiClient: { post: vi.fn() } }));

const post = vi.mocked(apiClient.post);

const fixturePost: InstagramPost = {
  id: "C123",
  shortcode: "C123",
  caption: "hello",
  author: { username: "creator", full_name: "Creator" },
  media: [{ type: "image", url: "https://scontent.cdninstagram.com/v/a.jpg", thumbnail: "t", dimensions: { width: 1, height: 1 } }],
};

function apiError(status: number, message: string, code: string) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status, data: { success: false, message, data: null, errors: null, code } },
  });
}

function renderForm(initialUrl?: string) {
  return render(
    <ToastProvider>
      <InputForm initialUrl={initialUrl} />
      <Toaster />
    </ToastProvider>
  );
}

const input = () => screen.getByLabelText("Instagram post, reel, or video URL");
const submitButton = () => screen.getByRole("button", { name: "Download" });

function submitUrl(url: string) {
  fireEvent.change(input(), { target: { value: url } });
  fireEvent.click(submitButton());
}

beforeEach(() => {
  post.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("InputForm", () => {
  it("rejects a non-Instagram link without calling the API", async () => {
    renderForm();
    submitUrl("https://example.com/p/C123/");

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Please paste a valid public Instagram post, reel, or IGTV link."
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("submits the cleaned URL, without tracking params", async () => {
    post.mockResolvedValue({ data: { success: true, message: "ok", data: fixturePost, errors: null } });
    renderForm();
    submitUrl("https://www.instagram.com/p/C123/?igsh=tracking#frag");

    await waitFor(() => expect(post).toHaveBeenCalledWith("/fetch", { url: "https://www.instagram.com/p/C123/" }));
    expect(await screen.findByText("@creator")).toBeTruthy();
  });

  it("explains a rate limit, and the input's description points at a real element", async () => {
    post.mockRejectedValue(apiError(429, "Too many requests. Please try again later.", "RATE_LIMITED"));
    renderForm();
    submitUrl("https://www.instagram.com/p/C123/");

    expect(await screen.findByText("Too many requests")).toBeTruthy();
    const describedBy = input().getAttribute("aria-describedby");
    expect(describedBy).toBe("instagram-url-error");
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Too many requests. Please try again later."
    );
  });

  // Regression: a timeout used to read exactly like a network/CORS failure.
  it("tells a timeout apart from other failures", async () => {
    post.mockRejectedValue(Object.assign(new Error("timeout of 30000ms exceeded"), { code: "ECONNABORTED" }));
    renderForm();
    submitUrl("https://www.instagram.com/p/C123/");

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This is taking longer than usual. Please try again in a moment."
    );
  });

  // Regression: toasts were deduplicated by message text, so retrying a
  // link that failed the same way showed nothing.
  it("announces every failed attempt, even when the message repeats", async () => {
    post.mockRejectedValue(apiError(502, "We couldn't fetch this post right now. Please try again in a moment.", "SERVER_ERROR"));
    renderForm();

    submitUrl("https://www.instagram.com/p/C123/");
    await waitFor(() => expect(screen.getAllByText("Couldn't fetch this link")).toHaveLength(1));

    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getAllByText("Couldn't fetch this link")).toHaveLength(2));
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("ignores a second submit while a fetch is in flight", async () => {
    post.mockReturnValue(new Promise(() => {}));
    renderForm();
    submitUrl("https://www.instagram.com/p/C123/");
    fireEvent.submit(submitButton().closest("form")!);

    await waitFor(() => expect(submitButton()).toHaveProperty("disabled", true));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("auto-submits an initial URL exactly once", async () => {
    post.mockResolvedValue({ data: { success: true, message: "ok", data: fixturePost, errors: null } });
    renderForm("https://www.instagram.com/p/C123/");

    expect(await screen.findByText("@creator")).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
