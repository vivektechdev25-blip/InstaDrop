import { describe, expect, it } from "vitest";
import {
  loadServerConfig,
  parseCommit,
  parseCorsOrigins,
  parsePort,
  parseRegionProxy,
  parseTrustProxy,
} from "../src/config/env";

describe("parsePort", () => {
  it("defaults to 4000 when unset or blank", () => {
    expect(parsePort(undefined)).toBe(4000);
    expect(parsePort("  ")).toBe(4000);
  });

  it("accepts a valid port", () => {
    expect(parsePort("8080")).toBe(8080);
  });

  // Regression: Number("abc") is NaN, which listen() treats as "any free
  // port" - a service bound somewhere nothing routes to.
  it.each(["abc", "0", "65536", "80.5", "-1"])("rejects %s", (raw) => {
    expect(() => parsePort(raw)).toThrow(/Invalid PORT/);
  });
});

describe("parseCorsOrigins", () => {
  it("defaults to localhost, never a wildcard", () => {
    expect(parseCorsOrigins(undefined)).toEqual(["http://localhost:3000"]);
    expect(parseCorsOrigins("")).toEqual(["http://localhost:3000"]);
  });

  it("splits, trims and drops empty entries", () => {
    expect(parseCorsOrigins(" https://a.netlify.app , ,https://example.com,")).toEqual([
      "https://a.netlify.app",
      "https://example.com",
    ]);
  });

  // Each of these used to be accepted and then silently never match the
  // browser's Origin header.
  it.each([
    ["trailing slash", "https://example.com/", /Use "https:\/\/example\.com"/],
    ["path", "https://example.com/app", /Use "https:\/\/example\.com"/],
    ["mixed-case host", "https://Example.com", /Use "https:\/\/example\.com"/],
    ["wildcard", "*", /not a URL/],
    ["non-http scheme", "ftp://example.com", /http or https/],
    ["only separators", " , , ", /contains no origins/],
  ])("rejects a %s", (_label, raw, message) => {
    expect(() => parseCorsOrigins(raw)).toThrow(message);
  });
});

describe("loadServerConfig", () => {
  it("reads from the provided environment", () => {
    expect(loadServerConfig({ PORT: "5000", CORS_ORIGIN: "https://example.com" })).toEqual({
      port: 5000,
      corsOrigins: ["https://example.com"],
      trustProxy: undefined,
      commit: null,
      regionProxy: null,
    });
  });
});

describe("parseTrustProxy", () => {
  it("keeps the default when unset", () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy("  ")).toBeUndefined();
  });

  it("reads a bare integer as a hop count", () => {
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("reads anything else as a list of names or CIDRs", () => {
    expect(parseTrustProxy("loopback, 100.64.0.0/10")).toEqual(["loopback", "100.64.0.0/10"]);
  });
});

describe("parseCommit", () => {
  it("shortens a full SHA", () => {
    expect(parseCommit("1194212ee13f3794769d984bb73247635f147345")).toBe("1194212");
  });

  // It is echoed on a public endpoint, so only a hex SHA is ever accepted.
  it.each([undefined, "", "not-a-sha", "<script>", "abc"])("ignores %s", (value) => {
    expect(parseCommit(value)).toBeNull();
  });
});

describe("parseRegionProxy", () => {
  it("is off when unset", () => {
    expect(parseRegionProxy(undefined)).toBeNull();
    expect(parseRegionProxy("  ")).toBeNull();
  });

  it("splits the credentials out of the server, for Playwright and for logs", () => {
    expect(parseRegionProxy("http://user:p%40ss@203.0.113.7:8899")).toEqual({
      server: "http://203.0.113.7:8899",
      username: "user",
      password: "p@ss",
      label: "http://203.0.113.7:8899",
    });
  });

  it("accepts socks5 and a proxy without credentials", () => {
    expect(parseRegionProxy("socks5://proxy.example.in:1080")).toEqual({
      server: "socks5://proxy.example.in:1080",
      label: "socks5://proxy.example.in:1080",
    });
  });

  // Regression: URL normalises a scheme's default port away, so ":80" (a
  // common port for paid proxies) was refused as "needs an explicit port".
  it("keeps a port that happens to be the scheme's default", () => {
    expect(parseRegionProxy("http://user:pass@proxy.example.in:80")?.server).toBe("http://proxy.example.in:80");
    expect(parseRegionProxy("https://proxy.example.in:443")?.server).toBe("https://proxy.example.in:443");
  });

  it("accepts an IPv6 address", () => {
    expect(parseRegionProxy("http://user:pass@[2001:db8::7]:8899")?.server).toBe("http://[2001:db8::7]:8899");
  });

  // The value carries a password: an error must say what is wrong with it,
  // never repeat it into a boot log.
  it.each([
    ["not a URL", "nonsense"],
    ["an unsupported scheme", "ftp://user:secret-pass@203.0.113.7:21"],
    ["a missing port", "http://user:secret-pass@203.0.113.7"],
    ["a path", "http://user:secret-pass@203.0.113.7:8899/path"],
    // Chromium cannot sign in to SOCKS5: accepted, every re-read would fail.
    ["socks5 with a password", "socks5://user:secret-pass@203.0.113.7:1080"],
    // decodeURIComponent used to throw a bare "URI malformed" at boot.
    ["a broken %-escape", "http://user:secret-pass%zz@203.0.113.7:8899"],
  ])("rejects %s without echoing the password", (_label, value) => {
    let message = "";
    try {
      parseRegionProxy(value);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Invalid INSTAGRAM_REGION_PROXY_URL/);
    expect(message).not.toContain("secret-pass");
  });

  it("is read by loadServerConfig", () => {
    expect(loadServerConfig({ INSTAGRAM_REGION_PROXY_URL: "http://203.0.113.7:8899" }).regionProxy?.server).toBe(
      "http://203.0.113.7:8899"
    );
  });
});
