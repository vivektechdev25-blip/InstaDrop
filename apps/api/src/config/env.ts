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
  regionProxy: RegionProxy | null;
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

/** A proxy in Playwright's shape, plus a credential-free label for logs. */
export interface RegionProxy {
  server: string;
  username?: string;
  password?: string;
  /** scheme://host:port - never the credentials. */
  label: string;
}

const REGION_PROXY_SCHEMES = new Set(["http:", "https:", "socks5:"]);

/**
 * INSTAGRAM_REGION_PROXY_URL: where to re-read a post page when Instagram
 * has muted its music for this server's country (see playwrightTier's
 * region recovery). For example `http://user:pass@203.0.113.7:8899` for a
 * proxy in India. Unset disables the recovery.
 *
 * A malformed value stops the boot, like PORT and CORS_ORIGIN, rather than
 * silently disabling the feature. The error names the problem but never
 * echoes the value, which carries a password.
 */
export function parseRegionProxy(raw: string | undefined): RegionProxy | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid INSTAGRAM_REGION_PROXY_URL: not a URL (expected scheme://[user:pass@]host:port).");
  }
  if (!REGION_PROXY_SCHEMES.has(parsed.protocol)) {
    throw new Error("Invalid INSTAGRAM_REGION_PROXY_URL: the scheme must be http, https or socks5.");
  }
  // URL drops a scheme's default port (`http://host:80` has port ""), so
  // one written out is also looked for in the text itself.
  const port = parsed.port || explicitDefaultPort(trimmed);
  if (!parsed.hostname || !port) {
    throw new Error("Invalid INSTAGRAM_REGION_PROXY_URL: it needs a host and an explicit port.");
  }
  // "/" for http(s); "" for socks5, which is not a special scheme to URL.
  if ((parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) {
    throw new Error("Invalid INSTAGRAM_REGION_PROXY_URL: give only scheme, credentials, host and port.");
  }
  // Chromium cannot sign in to a SOCKS5 proxy, and Playwright refuses the
  // pair - which would fail every re-read instead of the boot.
  if (parsed.protocol === "socks5:" && (parsed.username || parsed.password)) {
    throw new Error(
      "Invalid INSTAGRAM_REGION_PROXY_URL: Chromium cannot use a socks5 proxy with a username or password; use http:// or https://."
    );
  }

  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    throw new Error(
      "Invalid INSTAGRAM_REGION_PROXY_URL: the username or password has a broken %-escape (write a literal % as %25)."
    );
  }

  const server = `${parsed.protocol}//${parsed.hostname}:${port}`;
  return {
    server,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    label: server,
  };
}

/** The `80` of `http://user:pass@host:80`, which URL normalises away. */
function explicitDefaultPort(raw: string): string {
  const authority = raw.slice(raw.indexOf("//") + 2).split(/[/?#]/, 1)[0] ?? "";
  return /:(\d+)$/.exec(authority.slice(authority.lastIndexOf("@") + 1))?.[1] ?? "";
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(env.PORT),
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    commit: parseCommit(env.RAILWAY_GIT_COMMIT_SHA),
    regionProxy: parseRegionProxy(env.INSTAGRAM_REGION_PROXY_URL),
  };
}
