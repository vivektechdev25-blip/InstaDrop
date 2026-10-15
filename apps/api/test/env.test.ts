import { describe, expect, it } from "vitest";
import {
  loadServerConfig,
  parseCommit,
  parseCorsOrigins,
  parsePort,
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
