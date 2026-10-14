import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { createApiRouter } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

export interface CreateAppOptions {
  /** Exact-match allowlist - see config/env.ts parseCorsOrigins(). */
  corsOrigins: string[];
}

/**
 * Builds the Express app without binding a port or registering process
 * signal handlers - that's server.ts's job. Split so the app can be
 * exercised in-process by tests (supertest), each with its own fresh rate
 * limiter counters; importing the old all-in-one app.ts started a real
 * server and installed SIGTERM handlers as a side effect.
 */
export function createApp({ corsOrigins }: CreateAppOptions): Express {
  const app = express();

  // Container platforms sit the app behind their own reverse proxy, which
  // sets X-Forwarded-For to the real client IP. Without telling Express to
  // trust it, express-rate-limit can't safely resolve req.ip for per-IP
  // limiting and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every
  // request - confirmed live in Render's logs, not assumed. `1` trusts
  // exactly one hop (the platform's own proxy) rather than the whole
  // forwarded chain, which matters: a client could otherwise set its own
  // X-Forwarded-For and spoof the IP the rate limiter keys on. Whether
  // Railway's edge is exactly one hop is NOT yet verified against the live
  // service - see docs/DEPLOYMENT.md.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());

  // Dependency-free liveness probe: touches no browser, no network, no
  // database, so it answers instantly even while a scrape is occupying the
  // worker. Container hosts poll an endpoint like this to decide whether
  // the instance is healthy, and it doubles as the one URL that's safe to
  // open in a browser to confirm a deploy actually worked (every real
  // endpoint either needs a POST body or rejects a bare GET).
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/v1", createApiRouter());

  app.use(errorHandler);

  return app;
}
