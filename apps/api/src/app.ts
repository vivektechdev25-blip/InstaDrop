import express from "express";
import helmet from "helmet";
import cors from "cors";
import { apiRouter } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { closeBrowser } from "./services/scrapers/browserManager";

const app = express();

app.use(helmet());
// Defaults to localhost, not a wildcard - an unset CORS_ORIGIN in
// production fails safe (blocks the real frontend, loudly and
// immediately obvious) rather than failing open (silently allowing any
// origin).
//
// Comma-separated, because a single deployed frontend legitimately has
// more than one origin: Vercel assigns a *.vercel.app URL and a custom
// domain usually gets added later, and both need to work without editing
// this value on every change. Splitting a single-value string is a no-op,
// so the simple case still behaves exactly as before.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Dependency-free liveness probe: touches no browser, no network, no
// database, so it answers instantly even while a scrape is occupying the
// worker. Container hosts poll an endpoint like this to decide whether the
// instance is healthy, and it doubles as the one URL that's safe to open in
// a browser to confirm a deploy actually worked (every real endpoint either
// needs a POST body or rejects a bare GET).
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1", apiRouter);

app.use(errorHandler);

// Render (and most container platforms) inject the port to bind on, and
// route external traffic to it - so this must be read from the environment
// rather than hardcoded, with 4000 kept as the local-dev default.
const port = Number(process.env.PORT ?? 4000);
// Explicit 0.0.0.0 rather than Node's default: container platforms route
// traffic to the container's external interface, and a process bound only
// to loopback is unreachable from outside it - the failure mode being a
// health check that never passes while the logs look perfectly healthy.
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`ReelSaveHub API listening on port ${port}`);
});

async function shutdown(): Promise<void> {
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
