import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
      colors: {
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
        display: [
          "clamp(2.5rem, 2.32rem + 0.75vw, 3rem)",
          { lineHeight: "1.1", fontWeight: "800", letterSpacing: "-0.02em" },
        ],
        h1: ["2rem", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "-0.01em" }],
        h2: ["1.5rem", { lineHeight: "1.25", fontWeight: "700" }],
        h3: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
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
      },
    },
  },
  plugins: [],
};

export default config;
