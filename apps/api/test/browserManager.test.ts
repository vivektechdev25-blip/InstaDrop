import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

type Listener = () => void;

interface FakeContext {
  close: ReturnType<typeof vi.fn>;
}

interface FakeBrowser {
  id: number;
  newContext: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: (event: string, listener: Listener) => void;
  die: () => void;
  contexts: FakeContext[];
}

let browserCount = 0;

function createFakeBrowser(): FakeBrowser {
  const listeners: Listener[] = [];
  const contexts: FakeContext[] = [];
  const browser: FakeBrowser = {
    id: ++browserCount,
    contexts,
    newContext: vi.fn(async () => {
      const context = { close: vi.fn(async () => {}) };
      contexts.push(context);
      return context;
    }),
    close: vi.fn(async () => browser.die()),
    on: (event, listener) => {
      if (event === "disconnected") listeners.push(listener);
    },
    // What an OOM kill looks like from the Node side.
    die: () => listeners.forEach((listener) => listener()),
  };
  return browser;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadModules() {
  vi.resetModules();
  const { chromium } = await import("playwright");
  const browserManager = await import("../src/services/scrapers/browserManager");
  const { AppError } = await import("../src/errors/AppError");
  const helpers = await import("../src/services/scrapers/mediaExtractionHelpers");
  return { launch: vi.mocked(chromium.launch), ...browserManager, AppError, helpers };
}

beforeEach(() => {
  browserCount = 0;
});

describe("getBrowser - crash recovery", () => {
  it("relaunches after the browser disconnects", async () => {
    const { launch, getBrowser } = await loadModules();
    const first = createFakeBrowser();
    const second = createFakeBrowser();
    launch.mockResolvedValueOnce(first as never).mockResolvedValueOnce(second as never);

    expect(await getBrowser()).toBe(first);
    expect(await getBrowser()).toBe(first);
    first.die();

    expect(await getBrowser()).toBe(second);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed launch", async () => {
    const { launch, getBrowser } = await loadModules();
    const healthy = createFakeBrowser();
    launch.mockRejectedValueOnce(new Error("launch failed")).mockResolvedValueOnce(healthy as never);

    await expect(getBrowser()).rejects.toThrow("launch failed");
    expect(await getBrowser()).toBe(healthy);
  });

  it("ignores a stale disconnect from an already-replaced browser", async () => {
    const { launch, getBrowser } = await loadModules();
    const first = createFakeBrowser();
    const second = createFakeBrowser();
    launch.mockResolvedValueOnce(first as never).mockResolvedValueOnce(second as never);

    await getBrowser();
    first.die();
    expect(await getBrowser()).toBe(second);

    // A late, duplicate event from browser #1 must not discard #2.
    first.die();
    expect(await getBrowser()).toBe(second);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("closeBrowser is idempotent", async () => {
    const { launch, getBrowser, closeBrowser } = await loadModules();
    const browser = createFakeBrowser();
    launch.mockResolvedValueOnce(browser as never);

    await getBrowser();
    await closeBrowser();
    await closeBrowser();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("closeBrowser does not throw after the browser has already died", async () => {
    const { launch, getBrowser, closeBrowser } = await loadModules();
    const browser = createFakeBrowser();
    browser.close.mockRejectedValue(new Error("Target page, context or browser has been closed"));
    launch.mockResolvedValueOnce(browser as never);

    await getBrowser();
    await expect(closeBrowser()).resolves.toBeUndefined();
  });

  it("closeBrowser does not throw while a launch is failing", async () => {
    const { launch, getBrowser, closeBrowser } = await loadModules();
    launch.mockRejectedValueOnce(new Error("launch failed"));

    const pending = getBrowser().catch(() => null);
    await expect(closeBrowser()).resolves.toBeUndefined();
    await pending;
  });
});

describe("withBrowserContext - bounded concurrency", () => {
  it("applies the shared user agent and viewport", async () => {
    const { launch, withBrowserContext, helpers } = await loadModules();
    const browser = createFakeBrowser();
    launch.mockResolvedValue(browser as never);

    await withBrowserContext(async () => "done");
    expect(browser.newContext).toHaveBeenCalledWith({
      userAgent: helpers.USER_AGENT,
      viewport: helpers.VIEWPORT,
    });
  });

  it("never runs more than two contexts at once", async () => {
    const { launch, withBrowserContext } = await loadModules();
    launch.mockResolvedValue(createFakeBrowser() as never);

    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        withBrowserContext(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
        })
      )
    );

    expect(peak).toBe(2);
  });

  it("queues eight and rejects the eleventh with a 503, then drains", async () => {
    const { launch, withBrowserContext, AppError } = await loadModules();
    launch.mockResolvedValue(createFakeBrowser() as never);

    const gate = deferred();
    const accepted = Array.from({ length: 10 }, () => withBrowserContext(() => gate.promise));
    const overflow = withBrowserContext(() => gate.promise);

    await expect(overflow).rejects.toBeInstanceOf(AppError);
    await expect(overflow).rejects.toMatchObject({ statusCode: 503, code: "SERVER_ERROR" });

    gate.resolve();
    await expect(Promise.all(accepted)).resolves.toHaveLength(10);
  });

  it("closes the context on success and on a thrown error", async () => {
    const { launch, withBrowserContext } = await loadModules();
    const browser = createFakeBrowser();
    launch.mockResolvedValue(browser as never);

    await withBrowserContext(async () => "ok");
    await expect(
      withBrowserContext(async () => {
        throw new Error("scrape failed");
      })
    ).rejects.toThrow("scrape failed");

    expect(browser.contexts).toHaveLength(2);
    for (const context of browser.contexts) {
      expect(context.close).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps the scrape's own error when closing the context also fails", async () => {
    const { launch, withBrowserContext } = await loadModules();
    const browser = createFakeBrowser();
    browser.newContext.mockResolvedValueOnce({
      close: vi.fn(async () => {
        throw new Error("browser has been closed");
      }),
    });
    launch.mockResolvedValue(browser as never);

    await expect(
      withBrowserContext(async () => {
        throw new Error("the real failure");
      })
    ).rejects.toThrow("the real failure");
  });

  it("releases its slot on every failure path - no deadlock afterwards", async () => {
    const { launch, withBrowserContext } = await loadModules();
    const browser = createFakeBrowser();
    browser.newContext.mockRejectedValueOnce(new Error("newContext failed"));
    launch.mockRejectedValueOnce(new Error("launch failed")).mockResolvedValue(browser as never);

    await expect(withBrowserContext(async () => "x")).rejects.toThrow("launch failed");
    await expect(withBrowserContext(async () => "x")).rejects.toThrow("newContext failed");
    await expect(
      withBrowserContext(async () => {
        throw new Error("run failed");
      })
    ).rejects.toThrow("run failed");

    // If any path above leaked a slot, at most one of these could start.
    let active = 0;
    let peak = 0;
    const gate = deferred();
    const running = Array.from({ length: 2 }, () =>
      withBrowserContext(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
      })
    );
    await vi.waitFor(() => expect(peak).toBe(2));
    gate.resolve();
    await Promise.all(running);
  });

  it("is the only way either scraping flow opens a context", () => {
    const read = (file: string) => readFileSync(join(__dirname, "../src/services", file), "utf8");
    for (const file of ["scrapers/playwrightTier.ts", "privateContentService.ts"]) {
      const source = read(file);
      expect(source).toContain("withBrowserContext(");
      expect(source).not.toContain(".newContext(");
      expect(source).not.toContain("getBrowser(");
    }
  });
});
