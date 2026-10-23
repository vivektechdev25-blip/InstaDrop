import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const WEB = join(__dirname, "..", "..");
const PUBLIC = join(WEB, "public");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("brand assets", () => {
  const icons = manifest().icons ?? [];

  // A missing icon is a silent 404 in production - the tab simply shows
  // the browser's default. Every file the app points at must exist.
  it("every manifest icon exists at the size it claims", () => {
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const file = join(PUBLIC, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const [width, height] = pngSize(file);
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });

  it("gives the maskable purpose its own padded file", () => {
    const maskable = icons.find((icon) => icon.purpose === "maskable");
    const plain = icons.filter((icon) => icon.purpose !== "maskable").map((icon) => icon.src);
    expect(maskable).toBeDefined();
    expect(plain).not.toContain(maskable?.src);
  });

  it.each([
    "brand/icon-32.png",
    "brand/icon-48.png",
    "brand/icon-192.png",
    "brand/apple-icon.png",
    "brand/wordmark-light.webp",
    "brand/wordmark-dark.webp",
  ])("%s exists", (file) => {
    expect(existsSync(join(PUBLIC, file))).toBe(true);
  });

  it("the layout and service worker no longer point at the old icons", () => {
    for (const file of ["src/app/layout.tsx", "public/sw.js"]) {
      const source = readFileSync(join(WEB, file), "utf8");
      expect(source, file).not.toMatch(/["'`]\/(icon-192|icon-512|apple-icon)\.png/);
    }
  });

  it("ships the Open Graph wordmark beside its route", () => {
    expect(existsSync(join(WEB, "src/app/og-wordmark.png"))).toBe(true);
  });

  // The owner's light and dark wordmarks (2026-10-23) must be the same size,
  // or the header would jump when the theme changes.
  it("has light and dark wordmark sources of the same size", () => {
    expect(pngSize(join(PUBLIC, "ignew.png"))).toEqual(pngSize(join(PUBLIC, "ignewdark.png")));
  });
});
