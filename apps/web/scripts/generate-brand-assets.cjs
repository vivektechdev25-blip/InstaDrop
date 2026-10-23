#!/usr/bin/env node
// Regenerates every brand asset in public/brand/, public/favicon.ico and the
// Open Graph wordmark from the owner's files (2026-10-23):
//   - public/ig.png, the icon: every square icon and the favicon;
//   - public/ignew.png, the wordmark for the light theme (navy "now");
//   - public/ignewdark.png, the same wordmark for the dark theme (white "now").
// The wordmarks are only resized, never recoloured. Run it again whenever a
// source changes:
//
//   node apps/web/scripts/generate-brand-assets.cjs
//
// Resizing happens in headless Chromium's canvas, borrowed from the API
// package's Playwright install, so the web app takes on no image-processing
// dependency for a task that runs a handful of times a year.

const fs = require("node:fs");
const path = require("node:path");

const WEB_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(WEB_DIR, "public");
const OUT_DIR = path.join(PUBLIC_DIR, "brand");
const OG_OUT = path.join(WEB_DIR, "src", "app", "og-wordmark.png");
const { chromium } = require(
  require.resolve("playwright", { paths: [path.join(WEB_DIR, "..", "api")] })
);

const SQUARE_ICONS = [
  // Transparent, filling nearly the whole square: what tabs and the
  // Android launcher's "any" purpose show.
  { file: "icon-32.png", size: 32, fill: 0.96 },
  { file: "icon-48.png", size: 48, fill: 0.94 },
  { file: "icon-192.png", size: 192, fill: 0.9 },
  { file: "icon-512.png", size: 512, fill: 0.9 },
  // iOS renders transparency as black, so the touch icon is opaque.
  { file: "apple-icon.png", size: 180, fill: 0.8, background: "#ffffff" },
  // Maskable: launchers crop to any shape inside a circle of radius 40%, so
  // the artwork must fit within 0.8 / sqrt(2) of the side to survive it.
  { file: "icon-maskable-512.png", size: 512, fill: 0.56, background: "#ffffff" },
];

// Header display height is up to 48px; 144px covers a 3x screen.
const WORDMARK_HEIGHT = 144;
// The Open Graph card is 1200x630.
const OG_WORDMARK_HEIGHT = 220;

function toDataUri(file) {
  return `data:image/png;base64,${fs.readFileSync(path.join(PUBLIC_DIR, file)).toString("base64")}`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const outputs = await page.evaluate(
    async ({ iconSrc, lightSrc, darkSrc, squareIcons, wordmarkHeight, ogHeight }) => {
      async function load(src) {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      }

      /** The source's opaque bounding box, so padding is ours to decide. */
      function trim(image) {
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, image.width, image.height);
        let minX = image.width, minY = image.height, maxX = -1, maxY = -1;
        for (let y = 0; y < image.height; y += 1) {
          for (let x = 0; x < image.width; x += 1) {
            if (data[(y * image.width + x) * 4 + 3] < 8) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const trimmed = new OffscreenCanvas(width, height);
        trimmed.getContext("2d").drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
        return trimmed;
      }

      /**
       * Downscales in halving steps. A single large reduction in canvas
       * samples too few source pixels and aliases fine detail - exactly
       * the detail that decides whether a 32px icon is still legible.
       */
      function scaleTo(source, width, height) {
        let current = source;
        while (current.width / 2 >= width && current.height / 2 >= height) {
          const half = new OffscreenCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
          const context = half.getContext("2d");
          context.imageSmoothingQuality = "high";
          context.drawImage(current, 0, 0, half.width, half.height);
          current = half;
        }
        const out = new OffscreenCanvas(width, height);
        const context = out.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(current, 0, 0, width, height);
        return out;
      }

      async function encode(canvas, type = "image/png") {
        // WebP for the header wordmarks: both theme variants are in the page,
        // so their weight lands on every first visit. Lossy at 0.92 keeps the
        // gradient clean at a fraction of the PNG size.
        const blob = await canvas.convertToBlob(type === "image/webp" ? { type, quality: 0.92 } : { type });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
      }

      const results = {};
      const icon = trim(await load(iconSrc));

      for (const { file, size, fill, background } of squareIcons) {
        const scale = (size * fill) / Math.max(icon.width, icon.height);
        const width = Math.round(icon.width * scale);
        const height = Math.round(icon.height * scale);
        const scaled = scaleTo(icon, width, height);
        const square = new OffscreenCanvas(size, size);
        const context = square.getContext("2d");
        if (background) {
          context.fillStyle = background;
          context.fillRect(0, 0, size, size);
        }
        context.drawImage(scaled, Math.round((size - width) / 2), Math.round((size - height) / 2));
        results[file] = await encode(square);
      }

      // Trimmed to the same box: the two files differ only in the colour of
      // "now", so their artwork shares one bounding box and the theme swap
      // never shifts the header.
      const light = trim(await load(lightSrc));
      const dark = trim(await load(darkSrc));
      const wordmarkWidth = Math.round((light.width * wordmarkHeight) / light.height);
      results["wordmark-light.webp"] = await encode(scaleTo(light, wordmarkWidth, wordmarkHeight), "image/webp");
      results["wordmark-dark.webp"] = await encode(scaleTo(dark, wordmarkWidth, wordmarkHeight), "image/webp");
      // The card's background is near-black, so it uses the dark-theme file.
      const ogWidth = Math.round((dark.width * ogHeight) / dark.height);
      results.og = await encode(scaleTo(dark, ogWidth, ogHeight));

      return {
        files: results,
        meta: {
          iconTrimmed: [icon.width, icon.height],
          wordmarkTrimmed: { light: [light.width, light.height], dark: [dark.width, dark.height] },
          wordmarkDisplay: [wordmarkWidth, wordmarkHeight],
          ogWordmark: [ogWidth, ogHeight],
        },
      };
    },
    {
      iconSrc: toDataUri("ig.png"),
      lightSrc: toDataUri("ignew.png"),
      darkSrc: toDataUri("ignewdark.png"),
      squareIcons: SQUARE_ICONS,
      wordmarkHeight: WORDMARK_HEIGHT,
      ogHeight: OG_WORDMARK_HEIGHT,
    }
  );

  await browser.close();

  for (const [file, base64] of Object.entries(outputs.files)) {
    const target = file === "og" ? OG_OUT : path.join(OUT_DIR, file);
    fs.writeFileSync(target, Buffer.from(base64, "base64"));
    const kb = (fs.statSync(target).size / 1024).toFixed(1);
    console.log(`${path.relative(WEB_DIR, target).padEnd(40)} ${kb.padStart(6)} KB`);
  }
  console.log(JSON.stringify(outputs.meta));
  writeFavicon();
}

// public/favicon.ico, built from the 32px and 48px icons above. Browsers use
// the <link rel="icon"> tags, but crawlers - Google's favicon in search
// results among them - also request /favicon.ico directly, and without a
// file there the address-bar route answers it with an HTML page.
const FAVICON_OUT = path.join(PUBLIC_DIR, "favicon.ico");
const FAVICON_SOURCES = ["icon-32.png", "icon-48.png"];

/** Wraps PNG images in an ICO container (ICO allows PNG entries as-is). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

function writeFavicon() {
  const images = FAVICON_SOURCES.map((file) => {
    const png = fs.readFileSync(path.join(OUT_DIR, file));
    // A PNG's width sits at byte 16 of its IHDR chunk.
    return { size: png.readUInt32BE(16), png };
  });
  fs.writeFileSync(FAVICON_OUT, buildIco(images));
  const kb = (fs.statSync(FAVICON_OUT).size / 1024).toFixed(1);
  console.log(`${path.relative(WEB_DIR, FAVICON_OUT).padEnd(40)} ${kb.padStart(6)} KB`);
}

module.exports = { buildIco, writeFavicon };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
