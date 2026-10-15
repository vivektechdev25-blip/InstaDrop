import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/apiClient", () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

const { useInstagramDownloader } = await import("@/hooks/useInstagramDownloader");

const REEL = "https://www.instagram.com/reel/ABC123/";

afterEach(() => {
  post.mockReset();
});

describe("useInstagramDownloader - one request per submission", () => {
  // Each /fetch is a browser render on the server - the expensive path that
  // took the container down. submit has more than one caller, so the hook
  // itself refuses overlapping calls rather than relying on every caller.
  it("sends one request however many submits land at once", async () => {
    let resolve!: (value: unknown) => void;
    post.mockImplementation(() => new Promise((done) => (resolve = done)));
    const { result } = renderHook(() => useInstagramDownloader());

    await act(async () => {
      for (let click = 0; click < 20; click += 1) void result.current.submit(REEL);
    });
    expect(post).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ data: { data: { shortcode: "ABC123", media: [] } } }));
    expect(result.current.status).toBe("SUCCESS");
  });

  it("accepts the next submission after the first settles, even on failure", async () => {
    post.mockRejectedValueOnce({ response: { status: 503, data: "<html/>", headers: {} } });
    post.mockResolvedValueOnce({ data: { data: { shortcode: "ABC123", media: [] } } });
    const { result } = renderHook(() => useInstagramDownloader());

    await act(async () => result.current.submit(REEL));
    expect(result.current.errorMessage).toBe("Our servers are busy right now. Please try again in a moment.");

    await act(async () => result.current.submit(REEL));
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("SUCCESS");
  });

  it("reports a rate limit with the wait the server gave", async () => {
    post.mockRejectedValueOnce({
      response: { status: 429, data: { success: false, message: "Too many requests. Please try again in 6 minutes.", code: "RATE_LIMITED" }, headers: { "retry-after": "360" } },
    });
    const { result } = renderHook(() => useInstagramDownloader());

    await act(async () => result.current.submit(REEL));
    expect(result.current.status).toBe("RATE_LIMITED");
    expect(result.current.errorMessage).toBe("Too many requests. Please try again in 6 minutes.");
  });
});
