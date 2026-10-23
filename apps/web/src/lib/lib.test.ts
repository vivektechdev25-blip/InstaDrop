import type { MediaItem } from "@reelsavenow/types";
import { describe, expect, it } from "vitest";
import { describeFetchFailure, describeRequestFailure } from "@/lib/apiErrors";
import { buildDownloadFilename, buildDownloadUrl } from "@/lib/downloadUrl";
import { isPlausibleSessionCookie } from "@/lib/privateContentValidators";
import { extractFromCatchAllPath, extractFromQueryParam } from "@/lib/urlParser";
import { cleanInstagramUrl, isValidInstagramUrl } from "@/lib/validators";

describe("describeRequestFailure", () => {
  const withResponse = (status: number, data: unknown, headers: Record<string, string> = {}) => ({
    isAxiosError: true,
    response: { status, data, headers },
  });

  it("uses the API envelope when there is one", () => {
    expect(
      describeRequestFailure(withResponse(403, { success: false, message: "Private.", code: "PRIVATE_ACCOUNT" }))
    ).toEqual({ status: 403, code: "PRIVATE_ACCOUNT", message: "Private.", retryAfterSeconds: null });
  });

  // A platform-level page (Railway's proxy answering while the container
  // restarts) carries no envelope. These used to all read "Something went
  // wrong", which says nothing about whether retrying will help.
  it.each([
    [502, "The server took too long to respond. Please try again."],
    [503, "Our servers are busy right now. Please try again in a moment."],
    [504, "The server took too long to respond. Please try again."],
    [500, "Something went wrong. Please try again."],
  ])("gives a bare %i HTML page a specific message", (status, message) => {
    expect(describeRequestFailure(withResponse(status, "<html>error</html>"))).toEqual({
      status,
      code: null,
      message,
      retryAfterSeconds: null,
    });
  });

  it("states how long a rate limit lasts when the server says", () => {
    const failure = describeRequestFailure(withResponse(429, "", { "retry-after": "540" }));
    expect(failure.message).toBe("Too many requests. Please try again in 9 minutes.");
    expect(failure.retryAfterSeconds).toBe(540);
  });

  it("says a minute for a short wait", () => {
    expect(describeRequestFailure(withResponse(429, "", { "retry-after": "20" })).message).toBe(
      "Too many requests. Please try again in a minute."
    );
  });

  it("falls back to a rate-limit message for a bare 429 with no header", () => {
    expect(describeRequestFailure(withResponse(429, "")).message).toBe("Too many requests. Please try again later.");
  });

  it.each([
    ["ECONNABORTED", "This is taking longer than usual. Please try again in a moment."],
    ["ETIMEDOUT", "This is taking longer than usual. Please try again in a moment."],
    ["ERR_NETWORK", "We couldn't reach the ReelSaveNow servers. Check your connection and try again."],
  ])("distinguishes %s", (code, message) => {
    expect(describeRequestFailure({ code })).toEqual({ status: null, code: null, message, retryAfterSeconds: null });
  });

  it("handles a non-axios failure", () => {
    expect(describeRequestFailure(new Error("boom")).message).toBe("Something went wrong. Please try again.");
  });
});

describe("describeFetchFailure", () => {
  it("reads the envelope and the Retry-After header from a fetch Response", async () => {
    const response = new Response(JSON.stringify({ success: false, message: "Slow down.", code: "RATE_LIMITED" }), {
      status: 429,
      headers: { "retry-after": "300", "content-type": "application/json" },
    });
    expect(await describeFetchFailure(response)).toEqual({
      status: 429,
      code: "RATE_LIMITED",
      message: "Slow down.",
      retryAfterSeconds: 300,
    });
  });

  it("copes with an HTML body", async () => {
    const failure = await describeFetchFailure(new Response("<html>503</html>", { status: 503 }));
    expect(failure.message).toBe("Our servers are busy right now. Please try again in a moment.");
  });
});

describe("Instagram URL helpers", () => {
  it("strips tracking params and fragments", () => {
    expect(cleanInstagramUrl("https://www.instagram.com/reel/ABC/?igsh=xyz&utm_source=ig#c")).toBe(
      "https://www.instagram.com/reel/ABC/"
    );
  });

  it("normalizes the host for links without www", () => {
    expect(cleanInstagramUrl(" https://instagram.com/p/ABC/ ")).toBe("https://www.instagram.com/p/ABC/");
  });

  it("normalizes the mobile host", () => {
    expect(cleanInstagramUrl("https://m.instagram.com/p/ABC/")).toBe("https://www.instagram.com/p/ABC/");
  });

  // Regression: the host used to be discarded unconditionally, turning a
  // Facebook or lookalike link into a real Instagram URL for another post.
  it.each([
    "https://www.facebook.com/reel/123456/",
    "https://www.instagram.com.evil.example/p/ABC/",
    "https://example.com/p/ABC/",
  ])("leaves %s alone so validation rejects it", (url) => {
    expect(cleanInstagramUrl(url)).toBe(url);
    expect(isValidInstagramUrl(cleanInstagramUrl(url))).toBe(false);
  });

  it("validates post, reel and tv links only", () => {
    expect(isValidInstagramUrl("https://www.instagram.com/p/ABC/")).toBe(true);
    expect(isValidInstagramUrl("https://www.instagram.com/tv/ABC")).toBe(true);
    expect(isValidInstagramUrl("https://www.instagram.com/stories/u/1/")).toBe(false);
    expect(isValidInstagramUrl("https://example.com/p/ABC/")).toBe(false);
  });
});

describe("direct URL entry points", () => {
  // Next.js collapses the "//" after the scheme before the route sees it.
  it("rebuilds an address-bar URL from collapsed catch-all segments", () => {
    expect(extractFromCatchAllPath(["https:", "www.instagram.com", "reel", "ABC"])).toBe(
      "https://www.instagram.com/reel/ABC"
    );
  });

  it("decodes encoded segments and tolerates malformed encoding", () => {
    expect(extractFromCatchAllPath(["https%3A", "www.instagram.com", "p", "ABC"])).toBe(
      "https://www.instagram.com/p/ABC"
    );
    expect(extractFromCatchAllPath(["%E0%A4%A", "x"])).toBe("%E0%A4%A/x");
  });

  it("returns null for empty input", () => {
    expect(extractFromCatchAllPath([])).toBeNull();
    expect(extractFromQueryParam({})).toBeNull();
    expect(extractFromQueryParam({ url: "  " })).toBeNull();
  });

  it("takes the first ?url= value", () => {
    expect(extractFromQueryParam({ url: ["https://a", "https://b"] })).toBe("https://a");
  });
});

describe("download URL builders", () => {
  const video: MediaItem = { type: "video", url: "https://x.fbcdn.net/v.mp4?a=1&b=2", thumbnail: "t", dimensions: { width: 1, height: 1 } };

  it("names single media and carousel slides", () => {
    expect(buildDownloadFilename("ABC", video, 0, 1)).toBe("reelsavenow_ABC.mp4");
    expect(buildDownloadFilename("ABC", { ...video, type: "image" }, 2, 3)).toBe("reelsavenow_ABC_3.jpg");
  });

  it("encodes the CDN URL as a single query parameter", () => {
    const built = new URL(buildDownloadUrl(video, "reelsavenow_ABC.mp4"));
    expect(built.pathname).toBe("/api/v1/download");
    expect(built.searchParams.get("url")).toBe(video.url);
    expect(built.searchParams.get("filename")).toBe("reelsavenow_ABC.mp4");
    expect(built.searchParams.has("format")).toBe(false);
  });

  it("names an MP3 by the same pattern", () => {
    expect(buildDownloadFilename("ABC", video, 0, 1, { format: "mp3" })).toBe("reelsavenow_ABC.mp3");
    expect(buildDownloadFilename("ABC", video, 1, 3, { format: "mp3" })).toBe("reelsavenow_ABC_2.mp3");
  });

  it("asks for an MP3, keeping the separate audio stream for the API to convert", () => {
    const audioUrl = "https://x.fbcdn.net/a.mp4?c=3";
    const built = new URL(buildDownloadUrl({ ...video, audioUrl }, "reelsavenow_ABC.mp3", { format: "mp3" }));
    expect(built.searchParams.get("format")).toBe("mp3");
    expect(built.searchParams.get("url")).toBe(video.url);
    expect(built.searchParams.get("audio")).toBe(audioUrl);
  });
});

describe("isPlausibleSessionCookie", () => {
  it("matches the backend's lenient shape check", () => {
    expect(isPlausibleSessionCookie("12345%3AabcDEF%3A28%3Axyz-123_zz")).toBe(true);
    expect(isPlausibleSessionCookie("short")).toBe(false);
    expect(isPlausibleSessionCookie("sessionid=12345678901234567890;")).toBe(false);
  });
});
