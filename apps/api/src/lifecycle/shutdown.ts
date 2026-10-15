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
}: ShutdownDependencies): (exitCode?: number) => Promise<void> {
  // The exit code is a signal to the platform: 0 means "asked to stop"
  // (SIGTERM during a deploy), non-zero means the process is going down
  // because something broke. A crash that exits 0 looks like a clean
  // shutdown in the host's logs and hides the failure that caused it.
  return async function shutdown(exitCode = 0): Promise<void> {
    const forcedExit = setTimeout(() => exit(exitCode || 1), forcedExitTimeoutMs);
    forcedExit.unref?.();

    await closeBrowser();
    closeServer(() => exit(exitCode));
  };
}
