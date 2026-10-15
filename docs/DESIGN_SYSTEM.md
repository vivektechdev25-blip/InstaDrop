# Design System

Established 2026-08-05 as a systematic refinement pass — audited the existing UI against common "looks unpolished" culprits first (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#ui-polish-pass-2026-08-05) for the findings), then built the tokens below to fix them. This is the source of truth going forward: new components should reach for these tokens rather than picking ad-hoc values, the same failure mode that caused the original audit findings.

## Logo

Two source files, supplied by the owner and kept as-is: `apps/web/public/ig.png` (the icon, 329×318) and `apps/web/public/ig2.png` (the "Reel SAVE NOW" wordmark, 863×318). Everything the site serves is generated from them into `public/brand/` by:

```
node apps/web/scripts/generate-brand-assets.cjs
```

| File | Used for |
|---|---|
| `wordmark-light.webp` / `wordmark-dark.webp` | Header (36–40px tall) and footer (32px) via `<BrandLogo>`, swapped by the `dark` class on `<html>` |
| `icon-32.png`, `icon-48.png`, `icon-192.png` | Favicons — 32 for tabs, 48 for search results, 192 for the rest |
| `apple-icon.png` | iOS home screen — opaque white, since iOS draws transparency as black |
| `icon-192.png`, `icon-512.png` | Manifest, `purpose: any` |
| `icon-maskable-512.png` | Manifest, `purpose: maskable` — artwork inside the 40%-radius safe circle |
| `src/app/og-wordmark.png` | Open Graph card |

**Dark theme.** The wordmark's "SAVE NOW" is black and disappears on the dark background. The dark variant recolours only near-black, colourless pixels to the dark theme's `--foreground` (`#fafafa`) at their original alpha. That is safe because it was measured first: the icon artwork contains no such pixels, and the lettering's anti-aliasing is carried in alpha rather than grey, so there is no halo. Never invert or CSS-filter the artwork — it wrecks the gradient.

**Known limit:** the source icon is 329×318, so the 512px icons are upscaled about 1.5× and slightly soft on high-density splash screens. A source of 1024px or more fixes it; rerun the script.

## Brand colours (2026-10-15)

Sampled from the logo artwork (`public/ig.png`), not chosen by eye — a hue histogram of its saturated pixels gives orange `#FB750A` (27°), hot pink `#F30362` (336°, the dominant hue at ~26% of the artwork) and violet `#7003BB` (276°). Tokens live in `src/app/globals.css`; every pairing was measured against WCAG 2.x and tuned per theme, because the same hue needs a darker stop on white and a lighter one on near-black.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#ffffff` | `#0c0911` (violet-tinted black) | page |
| `--primary` | `#d7095c` — 5.14:1 | `#fb609e` — 6.84:1 | brand text, icons, rings, tints |
| `--cta-from` → `--cta-to` | `#e10960` → `#9611d0` | same | filled buttons and badges; white label at 4.76 / 6.39:1 in both themes |
| `--brand-text-*` (3 stops) | `#d15705` `#dc095e` `#8311d0` | `#fc9936` `#fb5195` `#db81f8` | gradient headings (large text, ≥3:1) |
| `--muted-foreground` | `#656374` — 5.85:1 | `#aba5b6` — 8.27:1 | secondary text |
| `--brand-orange/pink/violet` | logo colours at full strength | same | decoration only — glows, hairlines — never behind or as text |

Rules that follow from the measurements:

- **A filled button is `bg-cta-gradient` with white text**, never `bg-primary`: in dark mode `--primary` is light enough for text on the page, so a filled `--primary` surface needs dark text (`--primary-foreground`).
- **Gradient text uses `.text-brand-gradient`**, which falls back to solid `--primary` where `background-clip: text` is unsupported, so text is never transparent.
- **Hero glow is radial gradients, not blurred shapes.** Worst case — all three glows stacked at full strength — still leaves muted text at 4.66:1 in both themes. Re-check if the opacities change.

## Typography

Plus Jakarta Sans, self-hosted by `next/font` (the CSP allows no third-party font hosts) with `display: "optional"` and no preload. Measured on the production build with Lighthouse (mobile): `swap` let the arriving font re-wrap the hero headline and push the input down — a 0.248 layout shift, where the site had been at 0 — and preloading put the font on the critical path. With `optional`, a visit that does not have the font almost immediately keeps the metric-matched fallback, and the font is used from cache on the next one.

| Token | Size | Weight | Use |
|---|---|---|---|
| `text-display` | clamp 36 → 64px | 800, −0.035em | hero h1 |
| `text-h1` | clamp 30 → 40px | 800 | page titles |
| `text-h2` | clamp 28 → 40px | 800, −0.03em | landing-page section titles |
| `text-title` | clamp 22 → 26px | 700 | section headings inside documents (legal pages) |
| `text-h3` | 18px | 700 | card and step titles |
| `text-lead` | clamp 17 → 19px | — | hero subtext |
| `text-body` | 15px / 1.65 | — | card and FAQ body copy |
| `text-eyebrow` | 12px, uppercase | 700, 0.08em | section labels |

**Only the hero h1 uses `text-wrap: balance`.** Balance on every heading, `text-wrap: pretty` on every paragraph and `text-rendering: optimizeLegibility` together roughly doubled page layout time on a throttled phone (traced: ~170ms → ~450ms) for no visible gain; they were removed.

## Scroll reveal

`components/motion/ScrollReveal.tsx`, mounted once, plus `reveal(order)` to mark an element. It replaced framer-motion's `whileInView`, which server-rendered every marketing section at `opacity: 0` — a full-page capture without scrolling showed ~1,500px of empty page, and slow hydration could leave real visitors the same.

- Nothing is hidden until the reader scrolls. No JavaScript, slow hydration, print, crawlers and screenshot tools all see the complete page.
- When it arms, only elements still entirely below the viewport wait for their entrance, so nothing already seen flickers.
- Reduced motion or no IntersectionObserver: it never arms.
- `opacity` and `transform` only, 0.55s, staggered 70ms via `--reveal-order`. SVG strokes with `.reveal-draw` draw in after their container.

Removing framer-motion from the marketing sections also cut the home route's first-load JavaScript from 179KB to 144KB.

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
| Button, Input, DialogClose, icon badges (InstallModal icon) | `rounded-md` |
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
