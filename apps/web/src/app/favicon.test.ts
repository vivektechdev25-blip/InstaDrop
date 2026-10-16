import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Crawlers - Google's favicon in search results among them - request
// /favicon.ico directly. Without a real file there, the address-bar route
// answered with an HTML page.
describe("favicon.ico", () => {
  it("is a real ICO holding the 32px and 48px icons", () => {
    const ico = fs.readFileSync(path.join(PUBLIC_DIR, "favicon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const entry = 6 + 16 * index;
      sizes.push(ico[entry]!);
      const offset = ico.readUInt32LE(entry + 12);
      const length = ico.readUInt32LE(entry + 8);
      expect(ico.subarray(offset, offset + 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
    }
    expect(sizes).toEqual([32, 48]);
  });

  it("matches the brand icons it was built from", () => {
    const ico = fs.readFileSync(path.join(PUBLIC_DIR, "favicon.ico"));
    const icon48 = fs.readFileSync(path.join(PUBLIC_DIR, "brand", "icon-48.png"));
    expect(ico.includes(icon48)).toBe(true);
  });
});
