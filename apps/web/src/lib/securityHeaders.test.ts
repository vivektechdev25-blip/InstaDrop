import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildContentSecurityPolicy, buildSecurityHeaders } = require("../../securityHeaders.cjs") as {
  buildContentSecurityPolicy: (api: string | undefined) => string;
  buildSecurityHeaders: (api: string | undefined) => Array<{ key: string; value: string }>;
};

const API = "https://instadrop-production-bb00.up.railway.app/api/v1";

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values.join(" ")];
    })
  );
}

describe("Content-Security-Policy", () => {
  const policy = directives(buildContentSecurityPolicy(API));

  it("lets the page call the API and nothing else off-origin", () => {
    expect(policy.get("connect-src")).toBe("'self' https://instadrop-production-bb00.up.railway.app");
  });

  it("allows previews from Instagram's CDN only", () => {
    for (const directive of ["img-src", "media-src"]) {
      expect(policy.get(directive)).toContain("https://*.cdninstagram.com");
      expect(policy.get(directive)).toContain("https://*.fbcdn.net");
      // A bare scheme source would allow every HTTPS host.
      expect(policy.get(directive)?.split(" ")).not.toContain("https:");
      expect(new Set(policy.get(directive)?.split(" ")).size).toBe(policy.get(directive)?.split(" ").length);
    }
  });

  it("forbids framing, plugins, base hijacking and off-site form posts", () => {
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("base-uri")).toBe("'self'");
    expect(policy.get("form-action")).toBe("'self'");
  });

  it("never allows eval or arbitrary script hosts", () => {
    expect(policy.get("script-src")).not.toContain("unsafe-eval");
    expect(policy.get("script-src")).toBe("'self' 'unsafe-inline'");
  });

  it("degrades to same-origin only if the API URL is unusable", () => {
    expect(directives(buildContentSecurityPolicy(undefined)).get("connect-src")).toBe("'self'");
  });
});

describe("security headers", () => {
  it("sends the full set", () => {
    const names = buildSecurityHeaders(API).map((header) => header.key);
    expect(names).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]);
  });
});
