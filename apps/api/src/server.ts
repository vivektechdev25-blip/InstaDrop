// Must stay the first import: config is read from process.env below, and
// apps/api/.env is only applied once this has run. (Genuine local-dev bug
// found 2026-08-18: dotenv was a dependency but nothing ever loaded it, and
// it went unnoticed because every .env value happened to match the code's
// own fallbacks.)
import "dotenv/config";
import { createApp } from "./app";
import { loadServerConfig } from "./config/env";
import { createShutdown } from "./lifecycle/shutdown";
import { closeBrowser } from "./services/scrapers/browserManager";

const FORCED_SHUTDOWN_TIMEOUT_MS = 10000;

// Fails fast on a malformed PORT or CORS_ORIGIN rather than booting into a
// state that looks healthy but can't serve the real frontend - see
// config/env.ts.
const config = loadServerConfig();
const app = createApp({ corsOrigins: config.corsOrigins });

// Explicit 0.0.0.0 rather than Node's default: container platforms route
// traffic to the container's external interface, and a process bound only
// to loopback is unreachable from outside it - the failure mode being a
// health check that never passes while the logs look perfectly healthy.
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`ReelSaveNow API listening on port ${config.port}`);
});

const shutdown = createShutdown({
  closeBrowser,
  closeServer: (onClosed) => server.close(onClosed),
  exit: (code) => process.exit(code),
  forcedExitTimeoutMs: FORCED_SHUTDOWN_TIMEOUT_MS,
});

// Wrapped rather than passed directly: an async listener that rejects
// becomes an unhandled rejection, which would take the process down
// without ever closing the server.
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

// Node's default for an unhandled rejection is to kill the process, and its
// default for an uncaught exception is to print to stderr and exit - both
// without saying which request caused it. On a container host the result is
// a restart with nothing in the logs to act on. These handlers do not
// swallow the failure; they make sure it is explained first, then shut down
// cleanly so in-flight responses and the browser are not abandoned.
process.on("unhandledRejection", (reason) => {
  console.error(
    "[server] unhandled promise rejection - shutting down:",
    reason instanceof Error ? reason.stack : reason
  );
  void shutdown(1);
});

process.on("uncaughtException", (error) => {
  console.error("[server] uncaught exception - shutting down:", error.stack ?? error);
  void shutdown(1);
});
