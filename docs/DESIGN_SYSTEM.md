# Design System

Established 2026-08-05 as a systematic refinement pass — audited the existing UI against common "looks unpolished" culprits first (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#ui-polish-pass-2026-08-05) for the findings), then built the tokens below to fix them. This is the source of truth going forward: new components should reach for these tokens rather than picking ad-hoc values, the same failure mode that caused the original audit findings.

## Logo and icon

Three source files, supplied by the owner on 2026-10-23 and kept as-is in `apps/web/public/`:

- `ignew.png` — the "reelsavenow" wordmark for the **light** theme (navy "now"), 1448×329;
- `ignewdark.png` — the same wordmark for the **dark** theme (white "now"), same size, identical apart from "now";
- `ig.png` — the icon, cut from the wordmark (378×329).

Everything the site serves is generated from them by:

```
node apps/web/scripts/generate-brand-assets.cjs
```

| File | Used for |
|---|---|
| `wordmark-light.webp` / `wordmark-dark.webp` | Header (36px on phones under 360px, 44px on other phones, 48px from 640px) and footer (40px) via `<BrandLogo>`, swapped by the `dark` class on `<html>` |
| `icon-32.png`, `icon-48.png`, `icon-192.png` | Favicons — 32 for tabs, 48 for search results, 192 for the rest |
| `favicon.ico` | `/favicon.ico` for crawlers, built from the 32px and 48px icons |
| `apple-icon.png` | iOS home screen — opaque white, since iOS draws transparency as black |
| `icon-192.png`, `icon-512.png` | Manifest, `purpose: any` |
| `icon-maskable-512.png` | Manifest, `purpose: maskable` — artwork inside the 40%-radius safe circle |
| `src/app/og-wordmark.png` | Open Graph card — the dark-theme wordmark, since the card is near-black |

The wordmarks are only resized, never recoloured: the owner supplies each theme's version. The icon is colourful on a transparent background, so one set serves both themes.

**Known limit:** the source icon is 378×329, so the 512px icons are upscaled about 1.4× and slightly soft on high-density splash screens. A source of 1024px or more fixes it; rerun the script.

## Brand colours (2026-10-15)

Sampled from the logo artwork (`public/ig.png`), not chosen by eye — a hue histogram of its saturated pixels gives orange `#FB750A` (27°), hot pink `#F30362` (336°, the dominant hue at ~26% of the artwork) and violet `#7003BB` (276°). Tokens live in `src/app/globals.css`; every pairing was measured against WCAG 2.x and tuned per theme, because the same hue needs a darker stop on white and a lighter one on near-black.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#fefbfc` (blush) + logo-colour wash | `#0c0911` (violet-tinted black) | page |
| `--card` | `#ffffff` | `#141019` | cards sit on the page |
| `--primary` | `#c50855` (336° 92% 41%) | `#fb609e` — 6.84:1 | brand text, icons, rings, tints |
| `--cta-from` → `--cta-to` | `#e10960` → `#9611d0` | same | filled buttons and badges; white label at 4.76 / 6.39:1 in both themes |
| `--brand-text-*` (3 stops) | `#d15705` `#dc095e` `#8311d0` | `#fc9936` `#fb5195` `#db81f8` | gradient headings (large text, ≥3:1) |
| `--muted-foreground` | `#656374` — 5.85:1 | `#aba5b6` — 8.27:1 | secondary text |
| `--brand-orange/pink/violet` | logo colours at full strength | same | decoration only — glows, hairlines — never behind or as text |

Rules that follow from the measurements:

- **A filled button is `bg-cta-gradient` with white text**, never `bg-primary`: in dark mode `--primary` is light enough for text on the page, so a filled `--primary` surface needs dark text (`--primary-foreground`).
- **Gradient text uses `.text-brand-gradient`**, which falls back to solid `--primary` where `background-clip: text` is unsupported, so text is never transparent.
- **Glows are radial gradients, never blurred shapes or fixed backgrounds** - measured as expensive here.
- **Light theme: one page-wide wash on `<body>`** (amber top-left, pink top-right, violet lower down), with the hero's own faint glow on top. Behind the centred hero the two together leave the grey subtext at 5.2:1 (375px) and 5.5:1 (1440px). Light `--primary` is 41% rather than 44% so small pink text keeps 4.5:1 over the wash. **Dark theme: the hero glow**, unchanged.
- **How contrast over the wash is checked:** axe-core cannot judge text over a gradient and reports it as "needs review". Every text element is instead measured against the pixels painted behind its glyphs (screenshot with text shown vs hidden, glyph pixels only, real viewport). 2026-10-16: every text element passes AA in both themes; the only lower values are disabled buttons, which WCAG exempts.

## Typography

**Inter** for text, **Inter Tight** for headings (2026-10-16; was Plus Jakarta Sans, whose heavy 800 headings read as chunky rather than refined). Inter Tight is Inter drawn narrower for display sizes, so headings sit tight without letters colliding and the pair reads as one family. Headings get it through their size tokens (`globals.css` maps `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-title` to `font-display`), all at 700 - the only Inter Tight weight loaded. Any other heading, such as an accordion trigger, stays in Inter at its own weight rather than being drawn as a synthetic bold.

Both are self-hosted by `next/font` (the CSP allows no third-party font hosts) with `display: "optional"` and no preload. Measured on the production build with Lighthouse (mobile): `swap` let the arriving font re-wrap the hero headline and push the input down — a 0.248 layout shift, where the site had been at 0 — and preloading put the font on the critical path. With `optional`, a visit that does not have the font almost immediately keeps the metric-matched fallback, and the font is used from cache on the next one. Weight on the wire: Inter (variable) 47KB plus Inter Tight 700 22KB, against 28KB for Jakarta; with no preload and `optional` it stays off the critical path - CLS 0, Lighthouse mobile 88 (87-89; earlier runs on this machine 82-90).

| Token | Size | Weight | Use |
|---|---|---|---|
| `text-display` | clamp 36 → 64px | 700, −0.04em | hero h1 |
| `text-h1` | clamp 30 → 40px | 700, −0.03em | page titles |
| `text-h2` | clamp 28 → 40px | 700, −0.035em | landing-page section titles |
| `text-title` | clamp 22 → 26px | 700, −0.025em | section headings inside documents (legal pages) |
| `text-h3` | 18px | 700, −0.015em | card and step titles |
| `text-lead` | clamp 17 → 19px | — | hero subtext |
| `text-body` | 15px / 1.65 | — | card and FAQ body copy |
| `text-eyebrow` | 12px, uppercase | 700, 0.08em | section labels |

**Only the hero h1 uses `text-wrap: balance`.** Balance on every heading, `text-wrap: pretty` on every paragraph and `text-rendering: optimizeLegibility` together roughly doubled page layout time on a throttled phone (traced: ~170ms → ~450ms) for no visible gain; they were removed.

## Scroll reveal

`components/motion/ScrollReveal.tsx`, mounted once, plus `reveal(order)` to mark an element. It replaced framer-motion's `whileInView`, which server-rendered every marketing section at `opacity: 0` — a full-page capture without scrolling showed ~1,500px of empty page, and slow hydration could leave real visitors the same.

- Nothing is hidden until the reader scrolls. No JavaScript, slow hydration, print, crawlers and screenshot tools all see the complete page.
- When it arms, only elements still entirely below the viewport wait for their entrance, so nothing already seen flickers.
- Reduced motion or no IntersectionObserver: it never arms.
- `opacity` and `transform` only: 28px rise over 0.7s, staggered 80ms via `--reveal-order` (raised from 18px / 0.55s / 70ms, which read as a flicker). SVG strokes with `.reveal-draw` draw in after their container.
- `reveal()` lives in `components/motion/reveal.ts`, a plain module, so server components (the step-by-step guide) can use it; `ScrollReveal.tsx` is a client module and re-exports it.

Removing framer-motion from the marketing sections also cut the home route's first-load JavaScript from 179KB to 144KB.

## Layout width (2026-10-16)

Container: 1360px from 2xl (was 1200px), 1.5rem gutters on phones and 2rem from lg. Measured before the change: at 1920px the widest content block was 1024px, 53% of the screen. Sections now use the width - a two-column FAQ, a three-column feature grid up to 1280px wide - while paragraphs keep their own max-width so line length stays readable.

The hero stays one centred column (a split hero with an illustration beside the form was tried and dropped in review). It is wider than before: the subtext is `max-w-2xl` and the input row `max-w-3xl` (768px, was 672px). The headline keeps `max-w-4xl` - at 1024px it breaks into the same three lines, so the extra width would only be empty space.

The step-by-step guide (`DownloadGuide`) illustrates three ways to get a link - the Instagram app, a desktop browser, the address-bar shortcut - with no Instagram screenshots, logo or Meta marks, and no copies of Instagram's own screens or menus. All three methods use photo-realistic images generated for this site (Figma AI, 2026-10-16): a hand holding a phone, a laptop on a desk, and hands typing on a laptop, each screen showing a gradient video preview and a download button, no text or logos. They live in `public/guide/` as WebP at 720px and 1280px wide (15-56KB each), served with `srcset`, intrinsic `width`/`height` (no layout shift) and `loading="lazy"`; a phone or a 1440px screen fetches the 720px file, a 2x desktop the 1280px one. The address-bar photo carries a floating card with the exact text to type (`reelsavenow.com/` + the link, then Enter) as real text, since a generated image can't be trusted to spell.

## Typography (before 2026-10-15)

Four new named tokens for headings — nothing previously distinguished "hero vs. page heading vs. section heading" as separate concepts (the audit found four different sizes doing four different jobs with no shared system: `text-4xl`/`text-5xl` for the hero, `text-3xl` for legal-page h1s, `text-xl` for legal-page h2s, bare `text-lg` for Card/Dialog titles).

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `text-display` | `clamp(2.5rem, 2.32rem + 0.75vw, 3rem)` (40→48px) | 800 | 1.1 | Hero headline only |
| `text-h1` | 32px | 700 | 1.2 | Page-level headings |
| `text-h2` | 24px | 700 | 1.25 | Section headings |
| `text-h3` | 20px | 600 | 1.3 | Card/Dialog titles, sub-headings |

Body and caption text use Tailwind's existing `text-base`/`text-sm`/`text-xs` — no new tokens needed, since their sizes (16/14/12px) already land inside target ranges. The only fix was line-height, applied centrally so every existing usage gets it automatically:

| Class | Size | Line-height (was → now) |
|---|---|---|
| `text-base` | 16px | 1.5 (already correct, untouched) |
| `text-sm` | 14px | 1.43 → **1.6** |
| `text-xs` | 12px | 1.33 → **1.5** |
| `text-lg` / `text-xl` | 18px / 20px | tightened to 1.3 (heading-adjacent usage, not body text) |

**Rule:** no bare `text-2xl`/`text-3xl`/`text-4xl`/`text-5xl` for new headings — reach for `text-display`/`text-h1`/`text-h2`/`text-h3` instead. `next/font` is intentionally not used — see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#lcp-investigation-2026-08-04-resolved-as-a-measurement-methodology-issue-not-a-code-defect) — the system font stack is a deliberate LCP decision, not an oversight, and out of scope for this pass.

## Spacing

**No new scale.** Tailwind's default spacing keys (`1,2,3,4,6,8,12,16,24`) already equal `4,8,12,16,24,32,48,64,96px` exactly. The only real fix was one off-scale outlier (`Footer`'s `py-10`/40px → `py-12`/48px) and the hero section's `py-20 sm:py-28` (80/112px, also off-scale) → `py-16 sm:py-24` (64/96px).

**Deliberately not hard-restricted in `tailwind.config.ts`:** Tailwind's full spacing scale (including values outside 4/8/12/16/24/32/48/64/96) stays available, because `h-11`/`w-11` (44px) is load-bearing for every WCAG 2.5.5 touch-target fix already shipped in this project. Removing that value to enforce a strict 9-number scale would regress verified accessibility work. New padding/margin/gap decisions should stick to the approved scale by convention, not by config-level restriction.

## Border radius

```
--radius-sm: 0.5rem   (8px)   — badges, small controls, hover backgrounds
--radius-md: 0.625rem (10px)  — buttons, inputs, icon badges
--radius-lg: 1rem      (16px) — cards, modals, dialogs, toasts
rounded-full                  — pills, avatars, dots (Tailwind default, untouched)
```

Proportional scale — bigger surfaces get a bigger radius, replacing the old system where one CSS variable (`--radius: 0.75rem`) was derived down for everything. The audit found `Card`/`Dialog` used Tailwind's *hardcoded* default `rounded-xl` (12px, unrelated to the CSS variable) while `Button`/`Input`/`Toast` used the *custom* `rounded-lg` token (also 12px at the time) — they only matched by coincidence. Every surface now maps explicitly:

| Element | Token |
|---|---|
| Button, Input, the dialog close button, icon badges (InstallModal icon) | `rounded-md` |
| Card, DialogContent, Toast | `rounded-lg` |
| MediaViewer (nested inside PreviewCard) | `rounded-md` — one step down from its parent card, standard nesting convention |
| Carousel nav buttons, avatars | `rounded-full` |

## Color — surface depth

The core bug: `--card` and `--background` were *identical* (`0 0% 100%`) in light mode, so every card relied entirely on a 1px border + `shadow-sm` to read as a distinct surface, with zero fill-color depth.

| Token | Light | Dark |
|---|---|---|
| `--background` | `0 0% 100%` (unchanged) | `240 10% 4%` (unchanged) |
| `--card` | `240 20% 98%` *(was 100% — now a real, subtle step down)* | `240 9% 7%` (unchanged) |
| `--surface-elevated` *(new)* | `0 0% 100%` — brighter than card | `240 8% 10%` — lighter than card |

`--surface-elevated` is a third tier for anything that floats above a card (`DialogContent`/`InstallModal`, `Toast`). In light mode, elevated content is brighter than a card (closer to white); in dark mode it's lighter than a card — standard dark-theme elevation convention (higher elevation = lighter surface), confirmed visually: the install modal reads as a clearly distinct, lighter panel against the near-black page background.

**Shadows:** no new custom values — Tailwind's `shadow-sm`/`shadow-md`/`shadow-lg` cover it, assigned consistently: `shadow-sm` for resting cards, `shadow-md` for small floating controls (carousel nav buttons), `shadow-lg` for anything modal/toast-level.

**Contrast:** `--muted-foreground` on `--card` computes to ≈4.84:1 in light mode — clears WCAG AA (4.5:1). The card-depth change only touched fill color, not text color, so this ratio is unaffected by this pass.

## Motion

150–300ms range project-wide, one consistent easing convention: **ease-out for entrances** (arriving under its own motion), **ease-in for exits** (pulled away).

| Animation | Duration | Easing | Use |
|---|---|---|---|
| `animate-fade-in` | 200ms | ease-out | Overlay/backdrop entrance |
| `animate-fade-out` | 200ms | ease-in | Overlay/backdrop exit |
| `animate-slide-up` | 250ms | ease-out | Dialog/Toast entrance |
| `animate-slide-down-out` | 200ms | ease-in | Dialog/Toast exit |

Radix's `Presence` primitive keeps `Dialog`/`Toast` mounted until their `data-[state=closed]` animation finishes, so these are real exit transitions, not hard unmounts. `Toast` previously had an entrance animation but no exit — it just vanished on dismiss; `useToast.tsx` now does a two-phase removal (mark `leaving` → play exit animation for `LEAVE_ANIMATION_MS` → actually remove from state) to support this.

Buttons get `active:scale-[0.98]` for a tactile press response; interactive controls (Button, Input, Dialog close, carousel nav, footer/nav links) all carry an explicit `transition-* duration-150 ease-out` rather than relying on unstated browser defaults.

## Known gap this pass didn't fully close

`MediaViewer` now reserves a real `aspect-ratio` (from `media.dimensions` when the scraper has real numbers, falling back to 9:16 for reels when it doesn't) to prevent layout shift, and images fade in on load via a `Skeleton` placeholder. Videos deliberately skip this — the native `poster` attribute already shows an instant placeholder, and gating the whole `<video>` element's opacity on a `loadeddata` event was tried and found to hide the poster too (a real regression caught via screenshot, not assumed fine) — reverted to trusting the native behavior for video specifically.
