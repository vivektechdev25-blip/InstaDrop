import { Writable } from "node:stream";
import type { Response as ExpressResponse } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors/AppError";
import { downloadService, getActiveDownloadCount } from "../src/services/downloadService";

const CDN = "https://scontent.cdninstagram.com";

interface FakeResponse extends Writable {
  headers: Record<string, string>;
  received: () => string;
  setHeader: (name: string, value: string) => void;
}

// Just enough of Express's Response for streamToResponse: a writable sink
// that records headers and bytes, and emits finish/close like a real one.
function createFakeResponse(): FakeResponse {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  }) as FakeResponse;
  sink.headers = {};
  sink.setHeader = (name, value) => {
    sink.headers[name.toLowerCase()] = value;
  };
  sink.received = () => Buffer.concat(chunks).toString("utf8");
  return sink;
}

const asExpress = (res: FakeResponse) => res as unknown as ExpressResponse;

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function media(body: BodyInit, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { "content-type": "video/mp4", ...headers } });
}

// Routes each requested URL to a canned response - an unexpected URL is
// a test failure, which is how "this host was never requested" is proven.
function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected request to ${url}`);
    return route();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("streamToResponse - redirect validation", () => {
  it("never requests a redirect target outside the allowlist", async () => {
    const fetchMock = stubFetch({ [`${CDN}/a.mp4`]: () => redirect("https://169.254.169.254/latest/meta-data") });

    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_URL" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an http downgrade", "http://scontent.cdninstagram.com/a.mp4"],
    ["file:", "file:///etc/passwd"],
    ["data:", "data:video/mp4;base64,AAAA"],
    ["javascript:", "javascript:alert(1)"],
  ])("rejects a redirect to %s without following it", async (_label, location) => {
    const fetchMock = stubFetch({ [`${CDN}/a.mp4`]: () => redirect(location) });

    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative Location against the current URL", async () => {
    const fetchMock = stubFetch({
      [`${CDN}/v/a.mp4`]: () => redirect("/v/b.mp4"),
      [`${CDN}/v/b.mp4`]: () => media("bytes"),
    });
    const res = createFakeResponse();

    await downloadService.streamToResponse(`${CDN}/v/a.mp4`, "a.mp4", asExpress(res));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.received()).toBe("bytes");
  });

  it("follows up to five redirects", async () => {
    const routes: Record<string, () => Response> = {};
    for (let hop = 0; hop < 5; hop += 1) {
      routes[`${CDN}/${hop}`] = () => redirect(`${CDN}/${hop + 1}`);
    }
    routes[`${CDN}/5`] = () => media("done");
    stubFetch(routes);
    const res = createFakeResponse();

    await downloadService.streamToResponse(`${CDN}/0`, "a.mp4", asExpress(res));
    expect(res.received()).toBe("done");
  });

  it("gives up on the sixth redirect, which also ends redirect loops", async () => {
    const fetchMock = stubFetch({
      [`${CDN}/a`]: () => redirect(`${CDN}/b`),
      [`${CDN}/b`]: () => redirect(`${CDN}/a`),
    });

    await expect(
      downloadService.streamToResponse(`${CDN}/a`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("maps a malformed Location to a 502, not a crash", async () => {
    stubFetch({ [`${CDN}/a.mp4`]: () => redirect("https://[::1") });

    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("requests every hop with manual redirect handling", async () => {
    const fetchMock = stubFetch({ [`${CDN}/a.mp4`]: () => media("x") });
    await downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
});

describe("streamToResponse - headers", () => {
  it("sanitizes the filename into a safe Content-Disposition", async () => {
    stubFetch({ [`${CDN}/a.mp4`]: () => media("x") });
    const res = createFakeResponse();

    await downloadService.streamToResponse(`${CDN}/a.mp4`, 'evil"\r\nSet-Cookie: x=1.mp4', asExpress(res));
    expect(res.headers["content-disposition"]).toBe('attachment; filename="evil___Set-Cookie__x_1.mp4"');
  });

  it("forwards Content-Length for an uncompressed body", async () => {
    stubFetch({ [`${CDN}/a.mp4`]: () => media("12345", { "content-length": "5" }) });
    const res = createFakeResponse();

    await downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(res));
    expect(res.headers["content-length"]).toBe("5");
  });

  // fetch() decompresses the body, so the upstream length no longer
  // describes what's streamed.
  it("omits Content-Length when the upstream body was content-encoded", async () => {
    stubFetch({
      [`${CDN}/a.mp4`]: () => media("decoded", { "content-length": "3", "content-encoding": "gzip" }),
    });
    const res = createFakeResponse();

    await downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(res));
    expect(res.headers["content-length"]).toBeUndefined();
  });

  it("maps a non-OK upstream response to a 502", async () => {
    stubFetch({ [`${CDN}/a.mp4`]: () => new Response("nope", { status: 403 }) });

    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("streamToResponse - timeouts and stream lifecycle", () => {
  it("fails with a 504 when headers take longer than 15s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
    );

    const pending = downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()));
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 504 });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  // The cap is on the header phase only: a real reel is tens of MB and
  // legitimately streams for longer than 15s.
  // The header timeout stops at the first byte: a transfer that keeps
  // moving is never cut off, however long it runs in total.
  it("does not abort a body that keeps streaming past 15s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signal: AbortSignal | undefined;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        controller.enqueue(new TextEncoder().encode("first-"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return media(body);
      })
    );
    const res = createFakeResponse();

    const pending = downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(res));
    // Sixty seconds in total, a chunk every ten - slow, but moving.
    for (let second = 10; second <= 60; second += 10) {
      await vi.advanceTimersByTimeAsync(10_000);
      controller.enqueue(new TextEncoder().encode("."));
    }
    expect(signal?.aborted).toBe(false);

    controller.enqueue(new TextEncoder().encode("last"));
    controller.close();
    await pending;
    expect(res.received()).toBe("first-......last");
  });

  // ...but one that sends headers and then goes silent no longer holds the
  // transfer, and its concurrency slot, open forever.
  it("fails a transfer whose upstream stalls mid-body", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first-"));
      },
    });
    stubFetch({ [`${CDN}/a.mp4`]: () => media(body) });
    const res = createFakeResponse();

    const pending = downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(res));
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(31_000);

    await expect(settled).resolves.toBe("upstream stalled mid-transfer");
    expect(getActiveDownloadCount()).toBe(0);
  });

  it("cancels the upstream stream when the client disconnects", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
      },
      cancel,
    });
    stubFetch({ [`${CDN}/a.mp4`]: () => media(body) });
    const res = createFakeResponse();

    const pending = downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(res));
    await vi.waitFor(() => expect(res.received()).toBe("partial"));
    res.destroy();

    await expect(pending).resolves.toBeUndefined();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it("rejects (rather than leaving an unhandled error) when the upstream stream fails", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        setTimeout(() => controller.error(new Error("upstream reset")), 5);
      },
    });
    stubFetch({ [`${CDN}/a.mp4`]: () => media(body) });

    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toThrow("upstream reset");
  });

  it("only ever surfaces AppErrors before streaming starts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

    const failure = await downloadService
      .streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).message).not.toContain("fetch failed");
  });
});

describe("streamToResponse - what it agrees to relay", () => {
  it.each([
    ["an HTML page", "text/html; charset=utf-8"],
    ["a JSON document", "application/json"],
    ["no content-type at all", ""],
  ])("refuses %s even from an allowlisted host", async (_label, contentType) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    stubFetch({
      [`${CDN}/a.mp4`]: () =>
        new Response(body, { status: 200, headers: contentType ? { "content-type": contentType } : {} }),
    });
    const res = createFakeResponse();

    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(res))
    ).rejects.toMatchObject({ statusCode: 502 });
    // Nothing was written, and the upstream connection was released.
    expect(res.headers["content-disposition"]).toBeUndefined();
    expect(cancel).toHaveBeenCalled();
  });

  it.each(["image/jpeg", "image/webp", "video/mp4", "audio/mp4"])("relays %s", async (type) => {
    stubFetch({ [`${CDN}/a`]: () => media("bytes", { "content-type": type }) });
    const res = createFakeResponse();

    await downloadService.streamToResponse(`${CDN}/a`, "a", asExpress(res));
    expect(res.received()).toBe("bytes");
  });

  it("refuses a file that declares itself larger than the cap", async () => {
    stubFetch({
      [`${CDN}/a.mp4`]: () => media("x", { "content-length": String(400 * 1024 * 1024) }),
    });
    await expect(
      downloadService.streamToResponse(`${CDN}/a.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("streamToResponse - concurrency", () => {
  // The rate limit bounds requests per window, not requests at once: a full
  // window's budget can arrive in the same second.
  it("answers 503 past the concurrent transfer cap, and frees slots after", async () => {
    const controllers: Array<ReadableStreamDefaultController<Uint8Array>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        media(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controllers.push(controller);
            },
          })
        )
      )
    );

    const transfers = Array.from({ length: 32 }, (_, index) =>
      downloadService.streamToResponse(`${CDN}/${index}.mp4`, "a.mp4", asExpress(createFakeResponse()))
    );
    await vi.waitFor(() => expect(getActiveDownloadCount()).toBe(32));

    await expect(
      downloadService.streamToResponse(`${CDN}/x.mp4`, "a.mp4", asExpress(createFakeResponse()))
    ).rejects.toMatchObject({ statusCode: 503 });

    for (const controller of controllers) controller.close();
    await Promise.all(transfers);
    expect(getActiveDownloadCount()).toBe(0);
  });
});
