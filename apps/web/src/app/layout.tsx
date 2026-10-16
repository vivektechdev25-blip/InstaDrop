import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { siteConfig } from "@/lib/siteConfig";

// Downloaded at build time and served from this origin (the CSP allows
// no third-party font hosts).
//
// display "optional", not "swap". Measured with Lighthouse (mobile) on the
// production build: with swap, the font arriving re-wrapped the hero
// headline - four or five lines at phone width - and pushed the input down,
// a 0.248 layout shift (the limit is 0.1; the site had been at 0). With
// optional the browser uses the font only if it is ready almost at once;
// otherwise that visit keeps the fallback and the font is cached for the
// next, so text never moves after it has painted.
//
// Not preloaded. Measured: preloading put the font file on the critical
// path and moved First Contentful Paint from 794ms to 1059ms (Lighthouse
// mobile). Unpreloaded, the first paint is the fallback font with no
// delay; the fonts arrive in the background and are used from cache.
const fontSans = Inter({
  subsets: ["latin"],
  display: "optional",
  preload: false,
  variable: "--font-sans",
});

// Headings only, so only the weight the heading tokens use
// (tailwind.config.ts): one small file rather than the variable font.
const fontDisplay = Inter_Tight({
  subsets: ["latin"],
  weight: "700",
  display: "optional",
  preload: false,
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  // app/manifest.ts (Next.js's file-convention route) generates this at
  // /manifest.webmanifest, not /manifest.json - confirmed live after
  // switching from the old static public/manifest.json.
  manifest: "/manifest.webmanifest",
  // Several sizes so each consumer picks a sharp one rather than scaling a
  // 192px image down to a 16px tab: 32 for tabs, 48 for search results
  // (Google asks for a multiple of 48), 192 for everything larger.
  icons: {
    icon: [
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/brand/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteConfig.name,
  },
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
};

// The browser chrome follows the page: the light background, or the dark
// theme's violet-tinted black.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0911" },
  ],
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("reelsavenow-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch (error) {}
})();
`;

const APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  // Real, deployed asset (apps/web/public/brand/icon-512.png) - not a
  // fabricated/placeholder image reference.
  image: `${siteConfig.url}/brand/icon-512.png`,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontDisplay.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(APPLICATION_JSON_LD) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
