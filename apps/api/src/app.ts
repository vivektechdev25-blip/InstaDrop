import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import { createApiRouter } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

export interface CreateAppOptions {
  /** Exact-match allowlist - see config/env.ts parseCorsOrigins(). */
  corsOrigins: string[];
  /** Overrides the default proxy trust - see DEFAULT_TRUST_PROXY. */
  trustProxy?: string | number | string[];
  /** Short commit SHA reported by /health, so a deploy can be verified. */
  commit?: string | null;
}

/**
 * Which hops in X-Forwarded-For are proxies rather than the client.
 *
 * Measured on production 2026-10-15 with `trust proxy = 1`: from one stable
 * client IPv4 address, consecutive requests landed in two or three
 * different rate-limit buckets (RateLimit-Remaining 57, 55, 58, 56, 54, 53).
 * Railway's edge reaches the container through more than one internal hop,
 * so a fixed hop count of 1 resolved req.ip to whichever internal proxy
 * forwarded the request - and the per-IP limiter was keyed per proxy, not
 * per client. One heavy user could exhaust a bucket shared with strangers,
 * while any one user's real budget was a multiple of the advertised one.
 *
 * Railway does not document its hop count, and community answers from its
 * own staff contradict each other. So trust is defined by address class,
 * not count: every non-public address is a proxy, and the client is the
 * right-most public address in the chain. That cannot be spoofed - a forged
 * X-Forwarded-For entry always sits to the left of the address Railway's
 * edge actually observed, and the walk stops before reaching it.
 * 100.64.0.0/10 is RFC 6598 shared address space, which Railway uses
 * internally and which is never a client's address as seen by the edge.
 */
const DEFAULT_TRUST_PROXY = ["loopback", "linklocal", "uniquelocal", "100.64.0.0/10"];

/**
 * Logs - once per process, and without any address - whether the client
 * key is resolving to a public address. If the forwarded chain ever changes
 * shape so that req.ip lands on a proxy again, this says so in the logs
 * instead of the rate limiter silently degrading.
 */
function reportProxyResolutionOnce(): RequestHandler {
  let reported = false;
  return (req, _res, next) => {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (!reported && forwardedFor) {
      reported = true;
      const hops = String(forwardedFor).split(",").length;
      const isTrusted = req.app.get("trust proxy fn") as (address: string, index: number) => boolean;
      const keyIsProxy = Boolean(req.ip) && isTrusted(req.ip as string, 0);
      console.log(
        `[trustProxy] forwarded chain has ${hops} entr${hops === 1 ? "y" : "ies"}; ` +
          (keyIsProxy
            ? "client key resolved to a PROXY address - per-IP rate limits are not per client"
            : "client key resolved to a public address")
      );
    }
    next();
  };
}

/**
 * Builds the Express app without binding a port or registering process
 * signal handlers - that's server.ts's job. Split so the app can be
 * exercised in-process by tests (supertest), each with its own fresh rate
 * limiter counters; importing the old all-in-one app.ts started a real
 * server and installed SIGTERM handlers as a side effect.
 */
export function createApp({
  corsOrigins,
  trustProxy = DEFAULT_TRUST_PROXY,
  commit = null,
}: CreateAppOptions): Express {
  const app = express();

  app.set("trust proxy", trustProxy);

  // Node's querystring rather than `qs`. No endpoint takes nested or array
  // query parameters - /download reads two flat strings - so the extended
  // parser was pure attack surface: `qs` carried two open advisories
  // (GHSA-4mjr-xmp4-gh2g, a DoS; GHSA-x5fp-wj9c-mxmx, an array-limit bypass)
  // that this setting takes out of the request path entirely.
  app.set("query parser", "simple");

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST"],
      // Cross-origin JavaScript can only read response headers the server
      // names here. Without it the frontend could not tell a user *when* a
      // rate limit lifts - it saw the 429, never the Retry-After.
      exposedHeaders: [
        "Retry-After",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "RateLimit-Policy",
      ],
      maxAge: 600,
    })
  );
  // Every request body this API accepts is a URL, plus a session cookie of
  // at most 1000 characters on the private endpoint. The 100kb default let
  // any caller make the server buffer and parse a hundred times that.
  app.use(express.json({ limit: "8kb" }));
  app.use(reportProxyResolutionOnce());

  // Dependency-free liveness probe: touches no browser, no network, no
  // database. Container hosts poll an endpoint like this to decide whether
  // the instance is healthy, and it doubles as the one URL that's safe to
  // open in a browser to confirm a deploy actually worked. `commit` makes
  // that confirmation exact: before it, whether a merge had deployed could
  // only be inferred from behaviour - and on 2026-10-15 a fix appeared to
  // be live for an hour while every build had in fact failed.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", commit });
  });

  app.use("/api/v1", createApiRouter());

  app.use(errorHandler);

  return app;
}
