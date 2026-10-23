import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/siteConfig";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// og-wordmark.png is the dark-theme wordmark (public/ignewdark.png, white
// "now"), generated beside this file by scripts/generate-brand-assets.cjs
// because the card's background is the dark theme's. Loaded through
// import.meta.url so the bundler ships it with the route on any host.
const WORDMARK_WIDTH = 968;
const WORDMARK_HEIGHT = 220;

export default async function OpengraphImage() {
  const wordmark = await fetch(new URL("./og-wordmark.png", import.meta.url)).then((response) =>
    response.arrayBuffer()
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by satori, not the browser */}
        <img
          alt={siteConfig.name}
          // satori accepts the raw bytes; the DOM typings only know strings.
          src={wordmark as unknown as string}
          width={WORDMARK_WIDTH}
          height={WORDMARK_HEIGHT}
        />
        <div style={{ fontSize: 30, color: "#a1a1aa", maxWidth: 860, textAlign: "center" }}>
          {siteConfig.tagline}
        </div>
      </div>
    ),
    { ...size }
  );
}
