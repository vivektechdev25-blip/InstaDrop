#!/usr/bin/env node
// Runs the whole app behind one local origin, ready for a tunnel:
//
//   http://localhost:3000            -> web dev server  (port 3001)
//   http://localhost:3000/api/v1/... -> API dev server  (port 4000)
//   http://localhost:3000/health     -> API dev server
//
//   node scripts/dev-tunnel.cjs        (or: corepack pnpm dev:tunnel)
//   ngrok http 3000                    (in a second terminal)
//
// Why one origin: the web app is started with NEXT_PUBLIC_API_BASE_URL=/api/v1,
// so the browser calls the API on the same host it loaded the page from -
// localhost:3000 here, or the ngrok URL. No CORS, no second tunnel, and a
// free ngrok URL's one-time warning page covers the API calls too.
//
// The env value is passed to the child process directly, not through a
// shell: Git Bash rewrites a leading "/" in env values into a Windows path
// ("/api/v1" -> "C:/Program Files/Git/api/v1").
//
// Ctrl+C stops everything this script started. An API already running on
// 4000 is reused; ports 3000 and 3001 must be free, so a second copy of this
// script refuses to start instead of running twice.

const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PROXY_PORT = 3000;
const WEB_PORT = 3001;
const API_PORT = 4000;
const API_BASE_PATH = "/api/v1";
const IS_WINDOWS = process.platform === "win32";

const children = [];
let shuttingDown = false;

function log(name, message) {
  console.log(`[${name}] ${message}`);
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function httpStatus(port, urlPath) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: urlPath, timeout: 60000 }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(0));
  });
}

async function waitFor(name, port, urlPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shuttingDown) return false;
    if ((await httpStatus(port, urlPath)) === 200) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function start(name, args, env = {}) {
  const options = { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] };
  // corepack is a .cmd shim on Windows, which needs a shell to launch; a
  // shell takes one command line (the arguments here are fixed constants,
  // never user input).
  const child = IS_WINDOWS
    ? spawn(["corepack", "pnpm", ...args].join(" "), { ...options, shell: true })
    : spawn("corepack", ["pnpm", ...args], options);
  const prefix = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .forEach((line) => log(name, line));
  child.stdout.on("data", prefix);
  child.stderr.on("data", prefix);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log(name, `exited unexpectedly (code ${code}). Stopping everything.`);
      stopAll(1);
    }
  });
  children.push(child);
  return child;
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // The shell, pnpm and the dev server are a tree of processes; kill the
    // whole tree, or the dev server lives on holding its port.
    if (IS_WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  proxy?.close();
  process.exit(code);
}

// --- The proxy -----------------------------------------------------------

const toApi = (url = "/") => url.startsWith(`${API_BASE_PATH}/`) || url === "/health" || url.startsWith("/health?");
const targetFor = (url) => ({ host: "127.0.0.1", port: toApi(url) ? API_PORT : WEB_PORT });

function createProxy() {
  const server = http.createServer((req, res) => {
    const target = targetFor(req.url);
    const upstream = http.request(
      { ...target, method: req.method, path: req.url, headers: req.headers },
      (upstreamRes) => {
        // Status, headers (Content-Type, Content-Disposition, Content-Length,
        // RateLimit-*, Retry-After) and body pass through unchanged; the body
        // is piped, so a large download is streamed, never buffered.
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.on("error", () => res.destroy());
      }
    );
    upstream.on("error", (error) => {
      if (res.headersSent) {
        // Mid-stream: cut the connection so the browser sees a failed
        // download, rather than a "complete" file with an error appended.
        res.destroy();
        return;
      }
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Proxy: nothing answering on port ${target.port} (${error.code}).`);
    });
    // The visitor gave up (closed the tab, cancelled the download): stop the
    // upstream request too, so the API stops streaming to nobody.
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });

  // WebSocket upgrades - the web dev server's hot reload.
  server.on("upgrade", (req, socket, head) => {
    const target = targetFor(req.url);
    const upstream = net.connect(target.port, target.host, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const close = () => { socket.destroy(); upstream.destroy(); };
    upstream.on("error", close);
    socket.on("error", close);
  });

  return server;
}

let proxy = null;

async function main() {
  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));

  for (const port of [PROXY_PORT, WEB_PORT]) {
    if (await portInUse(port)) {
      console.error(
        `Port ${port} is already in use. Stop whatever is running there first ` +
          `(another copy of this script, or a dev server started by hand), then run this again.`
      );
      process.exit(1);
    }
  }

  if (await portInUse(API_PORT)) {
    if ((await httpStatus(API_PORT, "/health")) === 200) {
      log("api", `already running on port ${API_PORT} - reusing it.`);
    } else {
      console.error(`Port ${API_PORT} is in use, but not by a healthy API (/health did not answer 200).`);
      process.exit(1);
    }
  } else {
    log("api", `starting on port ${API_PORT}...`);
    start("api", ["--filter", "@reelsavenow/api", "dev"]);
  }

  log("web", `starting on port ${WEB_PORT} (API at ${API_BASE_PATH}, same origin)...`);
  start("web", ["--filter", "@reelsavenow/web", "exec", "next", "dev", "-p", String(WEB_PORT)], {
    NEXT_PUBLIC_API_BASE_URL: API_BASE_PATH,
  });

  proxy = createProxy();
  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(PROXY_PORT, resolve);
  });
  log("proxy", `listening on port ${PROXY_PORT}`);

  if (!(await waitFor("api", API_PORT, "/health", 120000))) {
    console.error(`The API did not become healthy on port ${API_PORT} within 2 minutes. See the [api] lines above.`);
    stopAll(1);
  }
  log("api", "ready");

  // The first request compiles the page, which can take a while.
  if (!(await waitFor("web", WEB_PORT, "/", 240000))) {
    console.error(`The web app did not answer on port ${WEB_PORT} within 4 minutes. See the [web] lines above.`);
    stopAll(1);
  }
  log("web", "ready");

  const [page, health] = await Promise.all([httpStatus(PROXY_PORT, "/"), httpStatus(PROXY_PORT, "/health")]);
  if (page !== 200 || health !== 200) {
    console.error(`Proxy check failed: / answered ${page}, /health answered ${health}.`);
    stopAll(1);
  }

  console.log(
    [
      "",
      "Everything is up.",
      `  Open:        http://localhost:${PROXY_PORT}`,
      `  Share it:    run  ngrok http ${PROXY_PORT}  in a second terminal and open the https URL it prints`,
      "  Stop:        Ctrl+C here",
      "",
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  stopAll(1);
});
