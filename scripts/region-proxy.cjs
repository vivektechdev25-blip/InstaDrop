#!/usr/bin/env node
// A small forward proxy for the API's INSTAGRAM_REGION_PROXY_URL. Run it on
// any small server in the country whose Instagram the site's users see -
// India for ReelSaveNow - so the API can re-read a post page that Instagram
// muted for the API's own country (see apps/api/src/services/scrapers/
// regionRecovery.ts for why).
//
//   PROXY_USER=reelsavenow PROXY_PASSWORD='<long random>' PORT=8899 node region-proxy.cjs
//
// and on the API host:
//
//   INSTAGRAM_REGION_PROXY_URL=http://reelsavenow:<long random>@<server-ip>:8899
//
// Deliberately narrow, so it can never become an open proxy:
//   - HTTPS tunnels (CONNECT) only, to port 443 only;
//   - Instagram's own hosts only (instagram.com, cdninstagram.com, fbcdn.net),
//     and only where they resolve to a public address;
//   - every tunnel needs the username and password.
// The traffic stays TLS end to end: this process sees host names, never
// page contents. No dependencies - Node 18 or newer.

const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");

const ALLOWED_HOST = /(^|\.)(instagram\.com|cdninstagram\.com|fbcdn\.net)$/i;
const MAX_TUNNELS = 64;
// Every socket, including ones that never finish a request: without a cap
// and a deadline for the headers, anyone on the internet could hold open
// enough half-finished connections to exhaust a small server.
const MAX_CONNECTIONS = 256;
const HEADERS_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 15_000;

// Instagram's hosts resolve to public addresses. One that resolves anywhere
// else - a poisoned or rebinding DNS answer - is refused before a byte is sent.
const NON_PUBLIC = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
]) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
]) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

/** Instagram's hosts on 443, nothing else. */
function isAllowedTarget(host, port) {
  return port === 443 && typeof host === "string" && ALLOWED_HOST.test(host);
}

/** False for loopback, private, link-local and carrier-shared addresses. */
function isPublicAddress(address) {
  if (typeof address !== "string" || !net.isIP(address)) return false;
  // An IPv4 peer on a dual-stack socket reads as ::ffff:a.b.c.d.
  const mapped = address.toLowerCase().startsWith("::ffff:") && net.isIPv4(address.slice(7));
  const plain = mapped ? address.slice(7) : address;
  return !NON_PUBLIC.check(plain, net.isIPv4(plain) ? "ipv4" : "ipv6");
}

function sameSecret(given, expected) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Checks a `Proxy-Authorization: Basic ...` header against the configured pair. */
function isAuthorized(header, username, password) {
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  // Both compared, always, so a wrong username takes as long as a wrong password.
  const userOk = sameSecret(decoded.slice(0, separator), username);
  const passOk = sameSecret(decoded.slice(separator + 1), password);
  return userOk && passOk;
}

function refuse(socket, status, extraHeaders = "") {
  socket.end(`HTTP/1.1 ${status}\r\n${extraHeaders}Content-Length: 0\r\nConnection: close\r\n\r\n`);
}

function createRegionProxyServer({
  username,
  password,
  isAllowed = isAllowedTarget,
  isAllowedAddress = isPublicAddress,
  headersTimeoutMs = HEADERS_TIMEOUT_MS,
  maxConnections = MAX_CONNECTIONS,
  log = console.log,
} = {}) {
  if (!username || !password) throw new Error("PROXY_USER and PROXY_PASSWORD are both required.");
  let open = 0;

  const server = http.createServer(
    {
      // Covers only the request itself: a tunnel, once open, is a raw
      // socket with its own idle timeout below.
      headersTimeout: headersTimeoutMs,
      requestTimeout: headersTimeoutMs,
      connectionsCheckingInterval: Math.min(1_000, headersTimeoutMs),
    },
    (_request, response) => {
      // Plain HTTP is not proxied: Instagram is HTTPS-only, and a GET proxy
      // would see (and could be fed) full requests.
      response.writeHead(405, { "Content-Type": "text/plain" });
      response.end("This proxy only accepts CONNECT.\n");
    }
  );
  server.maxConnections = maxConnections;

  server.on("connect", (request, client, head) => {
    client.on("error", () => {});
    if (!isAuthorized(request.headers["proxy-authorization"], username, password)) {
      refuse(client, "407 Proxy Authentication Required", 'Proxy-Authenticate: Basic realm="region-proxy"\r\n');
      return;
    }

    const separator = (request.url ?? "").lastIndexOf(":");
    const host = (request.url ?? "").slice(0, separator);
    const port = Number((request.url ?? "").slice(separator + 1));
    if (separator < 1 || !isAllowed(host, port)) {
      log(`[region-proxy] refused ${request.url}`);
      refuse(client, "403 Forbidden");
      return;
    }
    if (open >= MAX_TUNNELS) {
      refuse(client, "503 Service Unavailable");
      return;
    }

    open += 1;
    let connected = false;
    let closed = false;
    const upstream = net.connect({ host, port, timeout: CONNECT_TIMEOUT_MS });

    // Before the tunnel is up, the client gets a status line and a clean
    // end; after, both sockets are simply torn down.
    const close = (status) => {
      if (closed) return;
      closed = true;
      open -= 1;
      upstream.destroy();
      if (!connected && status) refuse(client, status);
      else client.destroy();
    };

    upstream.once("connect", () => {
      if (!isAllowedAddress(upstream.remoteAddress)) {
        log(`[region-proxy] refused ${host}: it resolved to ${upstream.remoteAddress}, not a public address`);
        close("403 Forbidden");
        return;
      }
      connected = true;
      upstream.setTimeout(IDLE_TIMEOUT_MS);
      client.setTimeout(IDLE_TIMEOUT_MS);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
      log(`[region-proxy] tunnel to ${host}`);
    });
    upstream.on("timeout", () => close("504 Gateway Timeout"));
    upstream.on("error", () => close("502 Bad Gateway"));
    upstream.on("close", () => close());
    client.on("timeout", () => close());
    client.on("close", () => close());
  });

  return server;
}

module.exports = { createRegionProxyServer, isAllowedTarget, isAuthorized, isPublicAddress };

if (require.main === module) {
  const port = Number(process.env.PORT || 8899);
  const server = createRegionProxyServer({ username: process.env.PROXY_USER, password: process.env.PROXY_PASSWORD });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[region-proxy] listening on ${port}; Instagram hosts only, password required`);
  });
}
