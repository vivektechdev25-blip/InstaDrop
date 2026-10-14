import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../src/lifecycle/shutdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("createShutdown", () => {
  it("closes the browser, then the server, then exits cleanly", async () => {
    const order: string[] = [];
    const shutdown = createShutdown({
      closeBrowser: async () => {
        order.push("browser");
      },
      closeServer: (onClosed) => {
        order.push("server");
        onClosed();
      },
      exit: (code) => order.push(`exit:${code}`),
      forcedExitTimeoutMs: 10000,
    });

    await shutdown();
    expect(order).toEqual(["browser", "server", "exit:0"]);
  });

  it("still exits when closing the browser hangs forever", async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const closeServer = vi.fn();
    const shutdown = createShutdown({
      closeBrowser: () => new Promise<void>(() => {}),
      closeServer,
      exit,
      forcedExitTimeoutMs: 10000,
    });

    void shutdown();
    await vi.advanceTimersByTimeAsync(9999);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(closeServer).not.toHaveBeenCalled();
  });

  it("still exits when open connections keep the server from closing", async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const shutdown = createShutdown({
      closeBrowser: async () => {},
      closeServer: () => {},
      exit,
      forcedExitTimeoutMs: 10000,
    });

    await shutdown();
    await vi.advanceTimersByTimeAsync(10000);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
