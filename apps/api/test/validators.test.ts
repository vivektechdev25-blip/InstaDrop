import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedCdnUrl } from "../src/constants/allowedCdnHosts";
import { downloadMediaSchema } from "../src/validators/downloadMediaSchema";
import { fetchMediaSchema } from "../src/validators/fetchMediaSchema";
import { privateContentSchema } from "../src/validators/privateContentSchema";

const accepts = (url: string) => fetchMediaSchema.safeParse({ url }).success;

describe("fetchMediaSchema", () => {
  it.each([
    "https://www.instagram.com/p/C123abc/",
    "https://instagram.com/reel/DSdYE_pEm8i",
    "https://www.instagram.com/tv/ABC-_123/",
    "https://www.instagram.com/some.user/p/C123abc/",
  ])("accepts %s", (url) => {
    expect(accepts(url)).toBe(true);
  });

  it.each([
    ["lookalike host", "https://www.instagram.com.evil.com/p/C123/"],
    ["userinfo pointing elsewhere", "https://www.instagram.com@evil.com/p/C123/"],
    ["userinfo before the host", "https://user@www.instagram.com/p/C123/"],
    ["explicit port", "https://www.instagram.com:8443/p/C123/"],
    ["query-smuggled URL", "https://evil.com/?u=https://www.instagram.com/p/C123/"],
    ["stories (out of scope)", "https://www.instagram.com/stories/user/123/"],
    ["profile", "https://www.instagram.com/someuser/"],
    ["not a URL", "instagram.com/p/C123"],
  ])("rejects %s", (_label, url) => {
    expect(accepts(url)).toBe(false);
  });

  // The invariant browserManager's --no-sandbox justification rests on:
  // whatever the path contains, an accepted URL can only ever navigate to
  // Instagram's own host. The regex only anchors the start, so this is
  // what makes that safe - the authority is pinned before any path.
  it.each([
    "https://www.instagram.com/p/C123/../../../accounts/login",
    "https://www.instagram.com/p/C123/%2e%2e/%2e%2e/x",
    "https://www.instagram.com/p/C123\\@evil.com",
    "http://www.instagram.com/p/C123/",
  ])("pins the host to Instagram even for %s", (url) => {
    expect(accepts(url)).toBe(true);
    expect(["www.instagram.com", "instagram.com"]).toContain(new URL(url).hostname);
  });
});

describe("isAllowedCdnUrl", () => {
  it.each([
    "https://scontent.cdninstagram.com/v/a.jpg",
    "https://instagram.fdel27-4.fna.fbcdn.net/o1/v/a.mp4",
    "https://SCONTENT.CDNINSTAGRAM.COM/v/a.jpg",
  ])("allows %s", (url) => {
    expect(isAllowedCdnUrl(new URL(url))).toBe(true);
  });

  it.each([
    ["plain http", "http://scontent.cdninstagram.com/v/a.jpg"],
    ["ftp", "ftp://scontent.cdninstagram.com/v/a.jpg"],
    ["bare apex", "https://fbcdn.net/a.jpg"],
    ["suffix lookalike", "https://evilfbcdn.net/a.jpg"],
    ["allowlisted name as a subdomain", "https://fbcdn.net.evil.com/a.jpg"],
    ["trailing dot", "https://scontent.fbcdn.net./a.jpg"],
    // Cyrillic "е" - becomes punycode, which no longer ends in fbcdn.net.
    ["IDN lookalike", "https://scontent.fbcdn.nеt/a.jpg"],
    ["file", "file:///etc/passwd"],
    ["data", "data:text/plain,hi"],
    ["javascript", "javascript:alert(1)"],
    ["loopback", "https://127.0.0.1/a.jpg"],
  ])("rejects %s", (_label, url) => {
    expect(isAllowedCdnUrl(new URL(url))).toBe(false);
  });
});

describe("downloadMediaSchema", () => {
  it("accepts an allowlisted https CDN URL", () => {
    expect(
      downloadMediaSchema.safeParse({ url: "https://scontent.cdninstagram.com/v/a.jpg", filename: "a.jpg" })
        .success
    ).toBe(true);
  });

  it("rejects non-CDN hosts and plain http", () => {
    for (const url of ["https://example.com/a.jpg", "http://scontent.cdninstagram.com/v/a.jpg"]) {
      expect(downloadMediaSchema.safeParse({ url, filename: "a.jpg" }).success).toBe(false);
    }
  });

  it("requires a bounded filename", () => {
    const url = "https://scontent.cdninstagram.com/v/a.jpg";
    expect(downloadMediaSchema.safeParse({ url, filename: "" }).success).toBe(false);
    expect(downloadMediaSchema.safeParse({ url, filename: "a".repeat(256) }).success).toBe(false);
  });

  // The validator and the redirect-following service must apply one
  // allowlist. If either grows its own copy they can drift apart - and
  // drift between them is exactly the SSRF gap the per-hop check closes.
  it("shares one allowlist definition with downloadService", () => {
    for (const file of ["validators/downloadMediaSchema.ts", "services/downloadService.ts"]) {
      const source = readFileSync(join(__dirname, "../src", file), "utf8");
      expect(source).toContain('from "../constants/allowedCdnHosts"');
      expect(source).not.toMatch(/cdninstagram\\?\.com|fbcdn\\?\.net/);
    }
  });
});

describe("privateContentSchema", () => {
  const url = "https://www.instagram.com/reel/C123/";

  it("accepts a plausible sessionid value", () => {
    expect(
      privateContentSchema.safeParse({ sessionCookie: "12345%3AabcDEF%3A28%3Axyz-123_zz", url }).success
    ).toBe(true);
  });

  it.each([
    ["too short", "abc"],
    ["header injection", "12345678901234567890\r\nSet-Cookie: x=y"],
    ["cookie syntax", "sessionid=12345678901234567890; path=/"],
    ["too long", "a".repeat(1001)],
  ])("rejects %s", (_label, sessionCookie) => {
    expect(privateContentSchema.safeParse({ sessionCookie, url }).success).toBe(false);
  });

  it("never echoes the submitted cookie in validation errors", () => {
    const result = privateContentSchema.safeParse({ sessionCookie: "SECRET-but-invalid; value", url });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.flatten())).not.toContain("SECRET");
  });
});
