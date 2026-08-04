import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/siteConfig";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          gap: 28,
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "#7c3aed",
              fontSize: 40,
            }}
          >
            ⬇
          </div>
          <div style={{ fontSize: 56, fontWeight: 700 }}>{siteConfig.name}</div>
        </div>
        <div style={{ fontSize: 30, color: "#a1a1aa", maxWidth: 860, textAlign: "center" }}>
          Download Instagram photos, reels &amp; videos in original quality
        </div>
      </div>
    ),
    { ...size }
  );
}
