import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

const ORIGIN = "https://reelsavenow.example";
const newApp = () => createApp({ corsOrigins: [ORIGIN] });

// Bodies the validators reject immediately - the limiter counts every
// request, so these exercise it without ever reaching a scraper.
const invalidFetch = (app: ReturnType<typeof newApp>) =>
  request(app).post("/api/v1/fetch").send({ url: "not-a-url" });
const invalidDownload = (app: ReturnType<typeof newApp>) =>
  request(app).get("/api/v1/download").query({ url: "https://example.com/a.mp4", filename: "a.mp4" });
const invalidPrivate = (app: ReturnType<typeof newApp>) =>
  request(app).post("/api/v1/private/fetch").send({});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rate limits", () => {
  it.each([
    ["/fetch", invalidFetch, 10],
    ["/download", invalidDownload, 60],
    ["/private/fetch", invalidPrivate, 3],
  ] as const)("%s allows %i requests per 10 minutes", async (_route, send, limit) => {
    const app = newApp();

    const first = await send(app);
    expect(first.headers["ratelimit-policy"]).toBe(`${limit};w=600`);
    expect(first.headers["ratelimit-limit"]).toBe(String(limit));

    for (let sent = 1; sent < limit; sent += 1) {
      expect((await send(app)).status).not.toBe(429);
    }

    const blocked = await send(app);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      message: "Too many requests. Please try again later.",
      data: null,
      errors: null,
      code: "RATE_LIMITED",
    });
  });

  it("keeps an independent counter per endpoint", async () => {
    const app = newApp();
    for (let sent = 0; sent < 3; sent += 1) await invalidPrivate(app);
    expect((await invalidPrivate(app)).status).toBe(429);

    const fetchResponse = await invalidFetch(app);
    expect(fetchResponse.status).toBe(400);
    expect(fetchResponse.headers["ratelimit-remaining"]).toBe("9");

    const downloadResponse = await invalidDownload(app);
    expect(downloadResponse.headers["ratelimit-remaining"]).toBe("59");
  });

  // Regression: module-level limiters leaked counts between apps.
  it("gives each app instance fresh counters", async () => {
    const first = newApp();
    for (let sent = 0; sent < 3; sent += 1) await invalidPrivate(first);
    expect((await invalidPrivate(first)).status).toBe(429);
    expect((await invalidPrivate(newApp())).status).toBe(400);
  });
});

describe("error responses", () => {
  it("returns the standard envelope for validation errors", async () => {
    const response = await invalidFetch(newApp());
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, data: null, code: "INVALID_URL" });
    expect(response.body.errors.url).toContain("URL must be a public Instagram post, reel, or IGTV link.");
  });

  // Regression: body-parser's error carries the raw body; it used to be a
  // 500 that console.error'd the whole object - cookie included.
  it("answers malformed JSON with a 400 and never logs the raw body", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "SESSIONSECRET%3A123%3Aabc";

    const response = await request(newApp())
      .post("/api/v1/private/fetch")
      .set("Content-Type", "application/json")
      .send(`{"sessionCookie":"${secret}", broken`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "INVALID_URL" });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
  });

  it("answers an oversized body with a 413 envelope", async () => {
    const response = await request(newApp())
      .post("/api/v1/fetch")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ url: "x".repeat(200 * 1024) }));

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false, message: "Request body is too large." });
  });

  it("rejects a disallowed download host before any upstream request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await invalidDownload(newApp());

    expect(response.status).toBe(400);
    expect(response.body.errors.url).toEqual(["URL must be a direct Instagram CDN media link."]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown routes without leaking internals", async () => {
    const response = await request(newApp()).get("/api/v1/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.text).not.toMatch(/at \w+ \(|node_modules|[A-Z]:\\/);
  });
});

describe("security headers and CORS", () => {
  it("serves the health check with helmet's headers", async () => {
    const response = await request(newApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("echoes an allowlisted origin", async () => {
    const response = await request(newApp()).get("/health").set("Origin", ORIGIN);
    expect(response.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });

  it("does not allow other origins, including Netlify previews of the same site", async () => {
    for (const origin of ["https://evil.example", "https://deploy-preview-1--reelsavenow.netlify.app"]) {
      const response = await request(newApp()).get("/health").set("Origin", origin);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });
});
