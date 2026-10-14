export interface ShutdownDependencies {
  closeBrowser: () => Promise<void>;
  closeServer: (onClosed: () => void) => void;
  exit: (code: number) => void;
  forcedExitTimeoutMs: number;
}

/**
 * The container is going away either way once SIGTERM arrives, so nothing
 * in here may be able to block the exit: a still-open keep-alive
 * connection keeps server.close()'s callback from ever firing, and
 * closeBrowser() awaits a browser that may already be dead. The forced
 * exit is unref'd so it never delays an otherwise-clean exit.
 *
 * Dependencies are injected (rather than calling process.exit and the
 * browser manager directly) so the "a hung close still exits" guarantee
 * can be tested without killing the test runner.
 */
export function createShutdown({
  closeBrowser,
  closeServer,
  exit,
  forcedExitTimeoutMs,
}: ShutdownDependencies): () => Promise<void> {
  return async function shutdown(): Promise<void> {
    const forcedExit = setTimeout(() => exit(1), forcedExitTimeoutMs);
    forcedExit.unref?.();

    await closeBrowser();
    closeServer(() => exit(0));
  };
}
