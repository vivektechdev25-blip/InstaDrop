const DEFAULT_PORT = 4000;
// Localhost, not a wildcard - an unset CORS_ORIGIN in production fails
// safe (blocks the real frontend, loudly and immediately obvious) rather
// than failing open (silently allowing any origin).
const DEFAULT_CORS_ORIGIN = "http://localhost:3000";

export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  /** Undefined keeps app.ts's address-class default. */
  trustProxy?: number | string[];
  commit: string | null;
}

/**
 * Escape hatch for proxy trust, so a change in Railway's forwarding can be
 * answered with a variable rather than a deploy. A bare integer is a hop
 * count; anything else is a comma-separated list of proxy-addr names or
 * CIDRs ("loopback, 100.64.0.0/10"). Unset keeps the default.
 */
export function parseTrustProxy(raw: string | undefined): number | string[] | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** Railway sets this on GitHub-connected deploys; nothing else needs to. */
export function parseCommit(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed && /^[0-9a-f]{7,40}$/i.test(trimmed) ? trimmed.slice(0, 7) : null;
}

/**
 * Railway (like every container platform) injects PORT. A malformed value
 * used to become `Number("abc")` -> NaN, which Node silently treats as
 * "pick any free port" - the service then boots on a port nothing routes
 * to and fails its health check with perfectly healthy-looking logs.
 */
export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}": expected an integer between 1 and 65535.`);
  }
  return port;
}

/**
 * Comma-separated, because one deployed frontend legitimately has more
 * than one origin (a platform-assigned *.netlify.app URL plus a custom
 * domain), and both need to work without a code change.
 *
 * Each entry must be a bare origin. cors() compares entries to the
 * browser's `Origin` header by exact string match, and browsers always
 * send `scheme://host[:port]` - lowercase, no path, no trailing slash. So
 * "https://reelsavenow.com/" (copied from an address bar) or a mixed-case
 * host used to be accepted here and then never match a single request:
 * production CORS failures with no error anywhere. Rejected at startup
 * instead, naming the exact value to use. A "*" is rejected the same way
 * - it was never a wildcard here (exact match), just a silent no-op.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const value = raw?.trim() ? raw : DEFAULT_CORS_ORIGIN;
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error(`Invalid CORS_ORIGIN "${raw}": contains no origins.`);
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS_ORIGIN entry "${origin}": not a URL.`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid CORS_ORIGIN entry "${origin}": must use http or https.`);
    }
    if (parsed.origin !== origin) {
      throw new Error(
        `Invalid CORS_ORIGIN entry "${origin}": browsers send the bare origin, so this would never match. Use "${parsed.origin}".`
      );
    }
  }

  return origins;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(env.PORT),
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    commit: parseCommit(env.RAILWAY_GIT_COMMIT_SHA),
  };
}
