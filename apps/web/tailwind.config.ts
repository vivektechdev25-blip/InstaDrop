import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // 1360px from 2xl up (was 1200px). Measured 2026-10-16: at 1920px the
    // widest content block was 1024px, 53% of the screen, with ~450px empty
    // on each side. Sections now use the width; paragraphs keep their own
    // max-width, so line length stays readable however wide this gets.
    // Mobile keeps its 1.5rem gutter; the wider gutters are in globals.css.
    // They can't live here: the container plugin applies per-breakpoint
    // padding only at its own `screens`, and with just 2xl listed an `lg`
    // entry was silently never applied - every screen under 1360px had the
    // 1.5rem phone gutter.
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1360px",
      },
    },
    extend: {
      // Inter for text and Inter Tight for headings, both self-hosted by
      // next/font (app/layout.tsx) - the CSP allows same-origin fonts only.
      // Inter Tight is Inter drawn narrower for large sizes, so headings
      // can be set tight without the letters colliding, and the two read
      // as one family. Headings pick it up through their size tokens
      // (globals.css), not through a class of their own.
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", "var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: {
          orange: "hsl(var(--brand-orange))",
          pink: "hsl(var(--brand-pink))",
          violet: "hsl(var(--brand-violet))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "surface-elevated": {
          DEFAULT: "hsl(var(--surface-elevated))",
          foreground: "hsl(var(--surface-elevated-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        // The second, supporting hue for the hero gradient/glow - exposed
        // as its own color token (not just buried inside backgroundImage
        // below) so the second glow blob can reference it directly
        // (bg-hero-glow-accent/[0.06]) instead of an inline hsl(var(...))
        // arbitrary value in the component.
        "hero-glow-accent": "hsl(var(--hero-gradient-to))",
      },
      backgroundImage: {
        "hero-gradient":
          "linear-gradient(to right, hsl(var(--hero-gradient-from)), hsl(var(--hero-gradient-to)))",
        // Filled buttons and badges carrying white text - see --cta-* in
        // globals.css for why this is not the full three-stop logo gradient.
        "cta-gradient": "linear-gradient(135deg, hsl(var(--cta-from)), hsl(var(--cta-to)))",
        // The logo's own three colours, for decoration only.
        "brand-gradient":
          "linear-gradient(120deg, hsl(var(--brand-orange)), hsl(var(--brand-pink)) 50%, hsl(var(--brand-violet)))",
      },
      boxShadow: {
        glow: "0 10px 30px -10px hsl(var(--cta-from) / 0.55)",
        "glow-lg": "0 18px 40px -12px hsl(var(--cta-from) / 0.6)",
      },
      borderRadius: {
        // Proportional scale, not one variable derived down - bigger
        // surfaces get a bigger radius (cards/modals=lg, buttons/inputs=
        // md, small controls=sm), each independently tunable. Card/Dialog
        // previously used Tailwind's *hardcoded* default `rounded-xl`
        // (unrelated to --radius) rather than a themed token, which only
        // visually matched the rest of the app by coincidence - fixed by
        // giving every surface an explicit, correct token to reach for.
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      fontSize: {
        // Named heading tokens - the fix for headings being sized ad hoc
        // (hero used text-4xl/5xl, legal pages used text-3xl for "h1" and
        // text-xl for "h2", Card/Dialog titles used bare text-lg - four
        // unrelated scales with no shared system).
        // Widened 2026-08-05: the old ceiling (3rem/48px) was reached by
        // ~1451px viewport width, meaning it sat flat at its max for the
        // entire 768-1440px breakpoint range - no real growth was visible
        // on any real desktop screenshot. New ceiling lands at 1440px
        // instead, so the whole desktop range actually grows: 40px(375) ->
        // ~54px(1024) -> 60px(1440, capped). Mobile floor barely moves
        // (40px -> ~41px) - not touched on purpose, per the scale-up pass
        // that added this comment.
        // Revised 2026-10-15: section headings were a flat 24px under a
        // 60px hero, so everything below the fold read as an afterthought.
        // Section titles now scale with the viewport too, keeping the step
        // down from the hero clear but not cliff-like.
        // Headings are Inter Tight at 700 - the one weight loaded for it -
        // with tracking that tightens as the size grows.
        display: [
          "clamp(2.25rem, 1.55rem + 3vw, 4rem)",
          { lineHeight: "1.05", fontWeight: "700", letterSpacing: "-0.04em" },
        ],
        h1: ["clamp(1.875rem, 1.6rem + 1.2vw, 2.5rem)", { lineHeight: "1.15", fontWeight: "700", letterSpacing: "-0.03em" }],
        h2: ["clamp(1.75rem, 1.45rem + 1.4vw, 2.5rem)", { lineHeight: "1.15", fontWeight: "700", letterSpacing: "-0.035em" }],
        h3: ["1.125rem", { lineHeight: "1.35", fontWeight: "700", letterSpacing: "-0.015em" }],
        // Section headings inside a document (legal pages). text-h2 is sized
        // to open a landing-page section; in running text it shouted.
        title: ["clamp(1.375rem, 1.25rem + 0.5vw, 1.625rem)", { lineHeight: "1.25", fontWeight: "700", letterSpacing: "-0.025em" }],
        // Body copy in cards and descriptions: 15px, one step up from 14px
        // text-sm, which read as fine print at the sizes it was used.
        body: ["0.9375rem", { lineHeight: "1.65" }],
        lead: ["clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)", { lineHeight: "1.6" }],
        eyebrow: ["0.75rem", { lineHeight: "1", fontWeight: "700", letterSpacing: "0.08em" }],
        // Existing Tailwind body/caption sizes (sm=14px, xs=12px) already
        // land inside the target ranges - only the line-height needed
        // fixing (was 1.43/1.33, tight enough to read as "cramped"),
        // applied centrally here so every existing text-sm/text-xs in the
        // app gets the rhythm fix without touching each component.
        sm: ["0.875rem", { lineHeight: "1.6" }],
        xs: ["0.75rem", { lineHeight: "1.5" }],
        lg: ["1.125rem", { lineHeight: "1.3" }],
        xl: ["1.25rem", { lineHeight: "1.3" }],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(0.5rem)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Radix's Presence primitive keeps a Dialog/Toast mounted until
        // its data-[state=closed] animation finishes, so this is a real
        // exit transition, not just a hard unmount - matches slide-up's
        // direction in reverse.
        "slide-down-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(0.5rem)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        // Radix Accordion exposes the measured content height as a CSS
        // custom property specifically so height:auto can still be
        // animated (a plain CSS transition can't animate to/from "auto").
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // HowItWorks' connector dots only - explicitly NOT used on the
        // hero glow, which stays fully static by earlier decision. Low
        // amplitude (0.6->1 opacity, 1->1.15 scale) since these are a
        // small supporting detail, not a large background element.
        // Gated by the motion-safe: variant at the call site, not here -
        // prefers-reduced-motion removes it via pure CSS media query,
        // no JS check needed for this piece.
        "dot-pulse": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
      },
      animation: {
        // 150-300ms range project-wide: ease-out for entrances (feels like
        // it's arriving under its own motion), ease-in for exits (feels
        // like it's being pulled away) - one consistent easing convention
        // rather than picking per component.
        "fade-in": "fade-in 0.2s ease-out",
        "fade-out": "fade-out 0.2s ease-in",
        "slide-up": "slide-up 0.25s ease-out",
        "slide-down-out": "slide-down-out 0.2s ease-in",
        shimmer: "shimmer 2s infinite linear",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-in",
        "dot-pulse": "dot-pulse 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
