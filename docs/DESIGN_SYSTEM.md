# Design System

Established 2026-08-05 as a systematic refinement pass — audited the existing UI against common "looks unpolished" culprits first (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md#ui-polish-pass-2026-08-05) for the findings), then built the tokens below to fix them. This is the source of truth going forward: new components should reach for these tokens rather than picking ad-hoc values, the same failure mode that caused the original audit findings.

## Typography

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
| Button, Input, DialogClose, icon badges (Navbar logo, InstallModal icon) | `rounded-md` |
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
