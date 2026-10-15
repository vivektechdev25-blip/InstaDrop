import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionApiBaseUrl, describeInvalidApiBaseUrl } from "../../buildEnv.cjs";
import { normalizeApiBaseUrl } from "@/lib/apiConfig";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Re-imports the config with a specific build-time environment. */
async function loadApiBaseUrl(configured: string | undefined) {
  vi.resetModules();
  if (configured === undefined) vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", configured);
  return (await import("@/lib/apiConfig")).API_BASE_URL;
}

describe("normalizeApiBaseUrl", () => {
  it("keeps a well-formed URL unchanged", () => {
    expect(normalizeApiBaseUrl("https://api.example.com/api/v1")).toBe("https://api.example.com/api/v1");
  });

  // Prevents `${API_BASE_URL}/download` from producing a doubled slash.
  it.each([
    ["https://api.example.com/api/v1/", "https://api.example.com/api/v1"],
    ["https://api.example.com/api/v1///", "https://api.example.com/api/v1"],
    ["  https://api.example.com/api/v1/  ", "https://api.example.com/api/v1"],
  ])("strips trailing slashes and whitespace from %s", (raw, expected) => {
    expect(normalizeApiBaseUrl(raw)).toBe(expected);
  });

  it.each([undefined, "", "   "])("treats %p as unset", (raw) => {
    expect(normalizeApiBaseUrl(raw)).toBeNull();
  });
});

describe("API_BASE_URL", () => {
  it("uses the configured value when the build environment provides one", async () => {
    await expect(loadApiBaseUrl("https://api.example.com/api/v1")).resolves.toBe(
      "https://api.example.com/api/v1"
    );
  });

  it("normalizes a configured value with a trailing slash", async () => {
    await expect(loadApiBaseUrl("https://api.example.com/api/v1/")).resolves.toBe(
      "https://api.example.com/api/v1"
    );
  });

  it("falls back to the local API only when nothing is configured", async () => {
    await expect(loadApiBaseUrl(undefined)).resolves.toBe("http://localhost:4000/api/v1");
  });

  // Defense in depth behind next.config.js: a production bundle must never
  // quietly resolve to a localhost URL.
  it("refuses to resolve at all if a production bundle was built without it", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    await expect(import("@/lib/apiConfig")).rejects.toThrow(/NEXT_PUBLIC_API_BASE_URL was not set/);
  });
});

describe("request URLs built from the base", () => {
  it("never doubles the slash before /download, even with a trailing slash", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/api/v1/");
    const { buildDownloadUrl } = await import("@/lib/downloadUrl");

    const built = new URL(
      buildDownloadUrl(
        {
          type: "video",
          url: "https://scontent.cdninstagram.com/v/a.mp4",
          thumbnail: "t",
          dimensions: { width: 1, height: 1 },
        },
        "reelsavenow_ABC.mp4"
      )
    );

    expect(built.pathname).toBe("/api/v1/download");
    expect(built.href).not.toContain("//download");
    expect(built.searchParams.get("url")).toBe("https://scontent.cdninstagram.com/v/a.mp4");
  });
});

describe("production build guard (buildEnv.cjs)", () => {
  // Each of these used to produce a successful build that shipped a broken
  // site; the one on 2026-10-14 was the unset case.
  it.each([
    [undefined, /not set/],
    ["", /not set/],
    ["   ", /not set/],
    ["http://localhost:4000/api/v1", /localhost/],
    ["http://127.0.0.1:4000/api/v1", /127\.0\.0\.1/],
    ["https://[::1]/api/v1", /visitor's own machine/],
    ["/api/v1", /not an absolute URL/],
    ["api.example.com/api/v1", /not an absolute URL/],
    ["ftp://api.example.com/api/v1", /http or https/],
  ])("rejects %p for a production build", (value, expected) => {
    expect(describeInvalidApiBaseUrl(value)).toMatch(expected);
    expect(() => assertProductionApiBaseUrl(value)).toThrow(expected);
  });

  it.each([
    "https://instadrop-production-bb00.up.railway.app/api/v1",
    "https://api.example.com/api/v1/",
    "http://api.internal.example/api/v1",
  ])("accepts %s", (value) => {
    expect(describeInvalidApiBaseUrl(value)).toBeNull();
    expect(() => assertProductionApiBaseUrl(value)).not.toThrow();
  });

  // Regression: the guard first keyed on the build phase alone, but
  // `next lint` loads the config under PHASE_PRODUCTION_BUILD too, so
  // linting started demanding deploy-time variables. The subcommand is what
  // tells the two apart; under Vitest, argv has no "build", so requiring the
  // config here exercises exactly the non-build path.
  it("does not demand the variable when the config is loaded by a non-build command", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    const loadConfig = (await import("../../next.config.js")).default as (
      phase: string
    ) => { reactStrictMode?: boolean };

    expect(process.argv.slice(2)).not.toContain("build");
    expect(() => loadConfig("phase-production-build")).not.toThrow();
    expect(() => loadConfig("phase-development-server")).not.toThrow();
    expect(loadConfig("phase-development-server").reactStrictMode).toBe(true);
  });

  it("explains exactly what to set and where", () => {
    expect(() => assertProductionApiBaseUrl(undefined)).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
    expect(() => assertProductionApiBaseUrl(undefined)).toThrow(/Builds/);
    expect(() => assertProductionApiBaseUrl(undefined)).toThrow(/Production/);
  });
});

describe("no second source of truth for the API URL", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  // The live bug was one missing environment variable, but what made it
  // invisible was the fallback sitting inline at each call site. Keeping the
  // fallback in exactly one file is what the build guard protects.
  it("keeps the localhost fallback only in apiConfig.ts", () => {
    const offenders = sourceFiles(join(__dirname, "..")).filter(
      (file) =>
        !file.endsWith(`lib${require("node:path").sep}apiConfig.ts`) &&
        !file.endsWith(".test.ts") &&
        !file.endsWith(".test.tsx") &&
        readFileSync(file, "utf8").includes("localhost:4000")
    );
    expect(offenders).toEqual([]);
  });

  it("reads the environment variable literally, so Next.js can inline it", () => {
    const source = readFileSync(join(__dirname, "apiConfig.ts"), "utf8");
    expect(source).toContain("process.env.NEXT_PUBLIC_API_BASE_URL");
  });
});
