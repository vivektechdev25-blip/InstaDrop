import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

// scripts/region-proxy.cjs is the proxy users run on a server in India. It
// lives outside the API package (it is not part of the API), so it is
// loaded by path - relative to this package, where the test runner runs.
const requireFromPackage = createRequire(path.join(process.cwd(), "package.json"));
const { createRegionProxyServer, isAllowedTarget, isAuthorized, isPublicAddress } = requireFromPackage(
  "../../scripts/region-proxy.cjs"
);

const USER = "reelsavenow";
const PASSWORD = "correct horse battery staple";
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

const servers: net.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function listen(server: net.Server): Promise<number> {
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port)));
}

/** Sends a CONNECT and resolves with the proxy's status and, if tunnelled, the socket. */
function connect(proxyPort: number, target: string, auth?: string): Promise<{ status: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "CONNECT",
      path: target,
      headers: auth ? { "Proxy-Authorization": auth } : {},
    });
    request.on("connect", (response, socket) => resolve({ status: response.statusCode ?? 0, socket }));
    request.on("error", reject);
    request.end();
  });
}

describe("region proxy: who may use it", () => {
  it("allows Instagram's hosts on 443 only", () => {
    expect(isAllowedTarget("www.instagram.com", 443)).toBe(true);
    expect(isAllowedTarget("scontent-sjc6-1.cdninstagram.com", 443)).toBe(true);
    expect(isAllowedTarget("instagram.fdel27-6.fna.fbcdn.net", 443)).toBe(true);
    expect(isAllowedTarget("www.instagram.com", 80)).toBe(false);
    expect(isAllowedTarget("example.com", 443)).toBe(false);
    expect(isAllowedTarget("instagram.com.evil.example", 443)).toBe(false);
    expect(isAllowedTarget("notinstagram.com", 443)).toBe(false);
  });

  it("needs both the username and the password", () => {
    expect(isAuthorized(basic(USER, PASSWORD), USER, PASSWORD)).toBe(true);
    expect(isAuthorized(basic(USER, "wrong"), USER, PASSWORD)).toBe(false);
    expect(isAuthorized(basic("wrong", PASSWORD), USER, PASSWORD)).toBe(false);
    expect(isAuthorized(undefined, USER, PASSWORD)).toBe(false);
    expect(isAuthorized("Bearer token", USER, PASSWORD)).toBe(false);
  });

  it("refuses to start without credentials", () => {
    expect(() => createRegionProxyServer({ username: USER })).toThrow(/required/);
  });

  it("tunnels only to public addresses", () => {
    expect(isPublicAddress("157.240.1.174")).toBe(true);
    expect(isPublicAddress("2a03:2880:f12f:83:face:b00c:0:25de")).toBe(true);
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "",
      undefined,
    ]) {
      expect(isPublicAddress(address), String(address)).toBe(false);
    }
  });
});

describe("region proxy: over the wire", () => {
  it("challenges a request without credentials with 407", async () => {
    const port = await listen(createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {} }));
    const { status, socket } = await connect(port, "www.instagram.com:443");
    socket.destroy();
    expect(status).toBe(407);
  });

  it("refuses a host that is not Instagram's, even with credentials", async () => {
    const port = await listen(createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {} }));
    const { status, socket } = await connect(port, "example.com:443", basic(USER, PASSWORD));
    socket.destroy();
    expect(status).toBe(403);
  });

  it("does not proxy plain HTTP requests", async () => {
    const port = await listen(createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {} }));
    const status = await new Promise<number>((resolve) =>
      http.get({ host: "127.0.0.1", port, path: "http://www.instagram.com/" }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      })
    );
    expect(status).toBe(405);
  });

  it("tunnels bytes both ways to an allowed target", async () => {
    // A local echo server stands in for Instagram; the allowlist is widened
    // to it for this test only.
    const echoPort = await listen(net.createServer((socket) => socket.pipe(socket)));
    const proxyPort = await listen(
      createRegionProxyServer({
        username: USER,
        password: PASSWORD,
        log: () => {},
        isAllowed: (host: string, port: number) => host === "127.0.0.1" && port === echoPort,
        isAllowedAddress: () => true,
      })
    );

    const { status, socket } = await connect(proxyPort, `127.0.0.1:${echoPort}`, basic(USER, PASSWORD));
    expect(status).toBe(200);
    const echoed = await new Promise<string>((resolve) => {
      socket.once("data", (data) => resolve(data.toString()));
      socket.write("hello through the tunnel");
    });
    socket.destroy();
    expect(echoed).toBe("hello through the tunnel");
  });

  it("refuses a tunnel whose host resolves to a private address", async () => {
    const echoPort = await listen(net.createServer((socket) => socket.pipe(socket)));
    const proxyPort = await listen(
      createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {}, isAllowed: () => true })
    );
    const { status, socket } = await connect(proxyPort, `127.0.0.1:${echoPort}`, basic(USER, PASSWORD));
    socket.destroy();
    expect(status).toBe(403);
  });

  it("drops a connection that never finishes its request", async () => {
    const proxyPort = await listen(
      createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {}, headersTimeoutMs: 200 })
    );
    const started = Date.now();
    await new Promise<void>((resolve) => {
      const socket = net.connect(proxyPort, "127.0.0.1", () => socket.write("CONNECT www.instagram.com:443 HTTP/1.1\r\n"));
      socket.resume();
      socket.on("error", () => {});
      socket.on("close", () => resolve());
    });
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("keeps an open tunnel past that deadline", async () => {
    const echoPort = await listen(net.createServer((socket) => socket.pipe(socket)));
    const proxyPort = await listen(
      createRegionProxyServer({
        username: USER,
        password: PASSWORD,
        log: () => {},
        headersTimeoutMs: 200,
        isAllowed: () => true,
        isAllowedAddress: () => true,
      })
    );
    const { status, socket } = await connect(proxyPort, `127.0.0.1:${echoPort}`, basic(USER, PASSWORD));
    expect(status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const echoed = await new Promise<string>((resolve, reject) => {
      socket.once("data", (data) => resolve(data.toString()));
      socket.once("close", () => reject(new Error("the tunnel was closed")));
      socket.write("still open");
    });
    socket.destroy();
    expect(echoed).toBe("still open");
  });

  it("caps the number of connections", async () => {
    const proxyPort = await listen(
      createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {}, maxConnections: 1 })
    );
    const first = net.connect(proxyPort, "127.0.0.1");
    await new Promise((resolve) => first.once("connect", resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closedEarly = await new Promise<boolean>((resolve) => {
      const second = net.connect(proxyPort, "127.0.0.1");
      second.resume();
      second.on("error", () => {});
      second.once("close", () => resolve(true));
      setTimeout(() => {
        second.destroy();
        resolve(false);
      }, 1_000);
    });
    first.destroy();
    expect(closedEarly).toBe(true);
  });

  it("answers 502 when the target cannot be reached", async () => {
    const closedPort = await listen(net.createServer());
    await new Promise((resolve) => servers.pop()!.close(resolve));
    const proxyPort = await listen(
      createRegionProxyServer({ username: USER, password: PASSWORD, log: () => {}, isAllowed: () => true })
    );
    const { status, socket } = await connect(proxyPort, `127.0.0.1:${closedPort}`, basic(USER, PASSWORD));
    socket.destroy();
    expect(status).toBe(502);
  });
});
