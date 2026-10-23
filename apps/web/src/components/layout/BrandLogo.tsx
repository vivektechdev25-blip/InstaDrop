import { siteConfig } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";

// Intrinsic size of the generated wordmarks (scripts/generate-brand-assets.cjs).
// Passing it as width/height lets the browser reserve the box before the
// image arrives, so the header never shifts; CSS then sets the real height.
const WORDMARK_WIDTH = 634;
const WORDMARK_HEIGHT = 144;

interface BrandLogoProps {
  /** Height (and any layout) classes; width follows the aspect ratio. */
  className?: string;
}

/**
 * The "reelsavenow" wordmark, in the variant that suits the active theme.
 *
 * The owner supplied both (2026-10-23): public/ignew.png for the light theme,
 * with a navy "now", and public/ignewdark.png for the dark theme, with a
 * white "now" - otherwise identical, so the swap never shifts. The theme is a
 * class on <html> set before first paint, so a `dark:` swap shows the right
 * one with no flash; the hidden one is display:none and so is not announced.
 *
 * Plain <img>: these are static, already-sized local files, and next/image
 * would only add a runtime for nothing to optimise.
 */
export function BrandLogo({ className }: BrandLogoProps) {
  const shared = {
    width: WORDMARK_WIDTH,
    height: WORDMARK_HEIGHT,
    decoding: "async" as const,
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized brand asset */}
      <img {...shared} alt={siteConfig.name} src="/brand/wordmark-light.webp" className={cn("block w-auto dark:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized brand asset */}
      <img {...shared} alt={siteConfig.name} src="/brand/wordmark-dark.webp" className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}
