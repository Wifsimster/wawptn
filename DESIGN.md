---
name: WAWPTN — Neon Dusk
source: packages/frontend/src/index.css
mode: dark-only
colors:
  dark:
    background: "oklch(0.115 0.015 280)"
    foreground: "oklch(0.96 0.005 270)"
    card: "oklch(0.165 0.012 280)"
    card-foreground: "oklch(0.96 0.005 270)"
    popover: "oklch(0.165 0.012 280)"
    popover-foreground: "oklch(0.96 0.005 270)"
    primary: "oklch(0.55 0.27 270)"
    primary-foreground: "oklch(0.97 0.014 254.604)"
    secondary: "oklch(0.22 0.02 280)"
    secondary-foreground: "oklch(0.90 0.005 270)"
    muted: "oklch(0.22 0.01 280)"
    muted-foreground: "oklch(0.68 0.015 270)"
    accent: "oklch(0.30 0.015 280)"
    accent-foreground: "oklch(0.96 0.005 270)"
    destructive: "oklch(0.65 0.22 25)"
    destructive-foreground: "oklch(0.985 0 0)"
    border: "oklch(1 0 0 / 14%)"
    input: "oklch(1 0 0 / 18%)"
    ring: "oklch(0.55 0.27 270)"
    success: "oklch(0.723 0.191 142.5)"
    warning: "oklch(0.78 0.17 80)"
    warning-foreground: "oklch(0.20 0.06 80)"
    info: "oklch(0.70 0.13 230)"
    info-foreground: "oklch(0.15 0.04 230)"
    reward: "oklch(0.82 0.17 70)"
    reward-foreground: "oklch(0.20 0.06 70)"
    neon: "oklch(0.82 0.19 190)"
    ember: "oklch(0.72 0.18 50)"
    ember-foreground: "oklch(0.15 0.05 50)"
    steam: "oklch(0.237 0.029 238)"
    steam-light: "oklch(0.317 0.034 238)"
    steam-foreground: "oklch(0.985 0 0)"
    online: "oklch(0.65 0.19 155)"
    score-good: "oklch(0.60 0.18 155)"
    score-mixed: "oklch(0.75 0.15 85)"
    score-bad: "oklch(0.60 0.20 25)"
typography:
  sans: "\"Plus Jakarta Sans\", ui-sans-serif, system-ui, sans-serif"
  heading: "\"Bricolage Grotesque\", ui-sans-serif, system-ui, sans-serif"
  scale: tailwind-default
rounded:
  base: 0.625rem
  sm: "calc(var(--radius) * 0.6)"
  md: "calc(var(--radius) * 0.8)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) * 1.4)"
  2xl: "calc(var(--radius) * 1.8)"
  3xl: "calc(var(--radius) * 2.2)"
  4xl: "calc(var(--radius) * 2.6)"
elevation:
  shadow-1: "0 2px 12px oklch(0 0 0 / 0.15)"
  shadow-2: "0 8px 24px oklch(0 0 0 / 0.22)"
  shadow-3: "0 16px 48px oklch(0 0 0 / 0.30)"
  shadow-glow: "0 0 20px oklch(0.55 0.27 270 / 0.18)"
spacing:
  scale: tailwind-default (4px)
  min-touch-target: 44px
components:
  style: new-york
  primitives: radix
  icons: lucide-react
  motion: framer-motion
---

# WAWPTN — DESIGN.md

This file describes the design system **as it exists in the code**. It
proposes nothing. Every value comes from the cited file; where the code and a
doc disagree, the code wins and the gap goes under [Known Gaps](#known-gaps).
`docs/design-system.md` stays the detailed narrative (sprint history, size
histograms, a11y patterns).

## Overview

"What Are We Playing Tonight?" — a group game picker. The look is **Neon
Dusk**: a near-black violet canvas, one electric violet action color, warm
gold for rewards and premium, cyan for cool highlights, all under an
atmospheric layer (gradient mesh, drifting fog, 2.5 % noise grain, faint WebGL
aurora). Dark only, by brand choice; no light theme.

## Colors

Source: `packages/frontend/src/index.css` (`:root` l. 43–91, `@theme inline`
l. 93–147). Tailwind v4, no `tailwind.config`. All colors are OKLCH.

### Surfaces and shadcn roles

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `oklch(0.115 0.015 280)` | App canvas |
| `--foreground` | `oklch(0.96 0.005 270)` | Body text |
| `--card` / `--popover` | `oklch(0.165 0.012 280)` | Cards, menus, tooltips |
| `--primary` | `oklch(0.55 0.27 270)` | Primary CTA, focus ring, brand violet |
| `--primary-foreground` | `oklch(0.97 0.014 254.604)` | Text on primary |
| `--secondary` | `oklch(0.22 0.02 280)` | Secondary buttons, neutral chips |
| `--secondary-foreground` | `oklch(0.90 0.005 270)` | Text on secondary |
| `--muted` | `oklch(0.22 0.01 280)` | Placeholder rows, disabled surfaces |
| `--muted-foreground` | `oklch(0.68 0.015 270)` | Secondary text |
| `--accent` | `oklch(0.30 0.015 280)` | Hover / menu highlight |
| `--destructive` | `oklch(0.65 0.22 25)` | Delete, kick, loss |
| `--destructive-foreground` | `oklch(0.985 0 0)` | Text on destructive |
| `--border` | `oklch(1 0 0 / 14%)` | Hairlines (raised from 8 % for WCAG 1.4.11) |
| `--input` | `oklch(1 0 0 / 18%)` | Field outlines |
| `--ring` | `oklch(0.55 0.27 270)` | Focus |

### Semantic and domain tokens

| Token | Value | Use |
| --- | --- | --- |
| `--success` | `oklch(0.723 0.191 142.5)` | Positive confirmation |
| `--warning` / `-foreground` | `oklch(0.78 0.17 80)` / `oklch(0.20 0.06 80)` | Invite issues, "no common games" |
| `--info` / `-foreground` | `oklch(0.70 0.13 230)` / `oklch(0.15 0.04 230)` | Neutral attention |
| `--reward` / `-foreground` | `oklch(0.82 0.17 70)` / `oklch(0.20 0.06 70)` | Premium, crowns, gold tier |
| `--neon` | `oklch(0.82 0.19 190)` | Cool accent, silver tier |
| `--ember` / `-foreground` | `oklch(0.72 0.18 50)` / `oklch(0.15 0.05 50)` | Warm accent, bronze tier |
| `--steam` / `--steam-light` / `--steam-foreground` | `oklch(0.237 0.029 238)` / `oklch(0.317 0.034 238)` / `oklch(0.985 0 0)` | Steam buttons |
| `--online` | `oklch(0.65 0.19 155)` | Presence dot |
| `--score-good` / `-mixed` / `-bad` | `oklch(0.60 0.18 155)` / `oklch(0.75 0.15 85)` / `oklch(0.60 0.20 25)` | Metacritic ranges |

### Atmosphere (`index.css` l. 180–237)

`body::before` gradient mesh (four radial ellipses, violet 270/300, blue 240,
warm 50), `body::after` fog (`blur(90px)`, opacity 0.10, `fog-drift` 32 s),
`#root::after` SVG noise at 0.025, `.aurora-bg-layer` at 0.28. Fog and blur
orbs are dropped under `(pointer: coarse) and (max-width: 768px)` and under
reduced motion.

## Typography

Self-hosted variable woff2 in `public/fonts/`, `font-display: swap`, latin and
latin-ext subsets (`index.css` l. 10–41).

| Token | Family | Weights | Use |
| --- | --- | --- | --- |
| `--font-sans` | Plus Jakarta Sans | 300–700 | Body, labels, controls |
| `--font-heading` | Bricolage Grotesque | 600–800 | `h1`–`h6` (base layer), `CardTitle` |

Size scale: Tailwind defaults. Observed: `text-sm` body, `text-xs` labels,
`text-2xl` page titles, `text-3xl` display; `clamp()` only on the landing hero
(`docs/design-system.md`). Buttons `text-sm font-semibold`. Inputs are forced
to `16px` under `(any-pointer: coarse)` to stop iOS zoom.

## Layout

- Spacing: Tailwind 4 px scale; stick to `1, 2, 3, 4, 6, 8` steps.
- Card padding prop: `none` 0, `sm` `p-3`, `md` `p-4` (default), `lg` `p-6` (`ui/card.tsx`).
- Every button size has `min-h-[44px]` (`lg` 48 px); input `h-11` on mobile, `sm:h-10`.
- `body` pads `env(safe-area-inset-bottom)`, uses `100dvh`, `overflow-x: clip`.

## Elevation

| Token | Value | Used by |
| --- | --- | --- |
| `shadow-1` | `0 2px 12px oklch(0 0 0 / 0.15)` | Card |
| `shadow-2` | `0 8px 24px oklch(0 0 0 / 0.22)` | Tooltip, DropdownMenu, popovers |
| `shadow-3` | `0 16px 48px oklch(0 0 0 / 0.30)` | Dialog, sheets |
| `shadow-glow` | `0 0 20px oklch(0.55 0.27 270 / 0.18)` | Button `default`, Drawer handle, hero CTAs |

Glass surfaces: Card `bg-card/80 backdrop-blur-sm`; `.landing-glass-card`
`oklch(1 0 0 / 0.025)` + `blur(16px)`; `.landing-premium-card` with the
`premium-glow` pulse.

## Shapes

`--radius: 0.625rem` (10 px), scaled by multipliers (`index.css` l. 140–146):
`sm` 6 px, `md` 8 px, `lg` 10 px, `xl` 14 px, `2xl` 18 px, `3xl` 22 px, `4xl`
26 px.

| Element | Class |
| --- | --- |
| Button, Input | `rounded-lg` |
| Card | `rounded-xl` |
| Dialog | `sm:rounded-lg` |
| Tooltip, DropdownMenu content, Dialog close | `rounded-md` |
| Menu items | `rounded-sm` |
| Checkbox | `rounded-[4px]` |
| Profile holo card, group hero | `rounded-2xl` |

## Motion

- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` everywhere (CSS and Framer Motion). Buttons `duration-300`, press `active:scale-[0.97]` at 100 ms.
- Ambient loops: `fog-drift` 32 s, `premium-glow` 5 s, `profile-holo-sweep` 7 s, `profile-ring-spin` 4 s / 10 s, `admin-badge-sweep` 3 s.
- Global `prefers-reduced-motion: reduce` override to `0.01ms` (`index.css` l. 702–711), plus per-component `useReducedMotion()`.

## Components

shadcn `new-york`, Radix primitives (`radix-ui`, `@radix-ui/react-slot`),
icons `lucide-react` only, Vaul `Drawer`, `framer-motion`.

| Component | Conventions | Source |
| --- | --- | --- |
| `Button` | Variants `default` (+ `shadow-glow`), `destructive`, `outline`, `secondary`, `ghost`, `link`, `steam`; sizes `default`, `sm`, `lg`, `icon`; labels wrap (no `nowrap`); focus `ring-[3px] ring-ring/50` | `ui/button.tsx` |
| `Badge` | Adds `success`, `warning`, `info`, `reward`, `scoreGood`, `scoreMixed`, `scoreBad` (tint `/15`, border `/30`) | `ui/badge.tsx` |
| `Card` | `padding` prop; `CardTitle` carries `font-heading` | `ui/card.tsx` |
| `ResponsiveDialog` | Vaul Drawer below 640 px (96dvh cap), Radix Dialog above (`100dvh-2rem` cap) | `ui/responsive-dialog.tsx` |
| `Dialog` | 44 × 44 close button, `aria-label="Fermer"` | `ui/dialog.tsx` |
| `EmptyState` | Tones `neutral`, `warning` (reward tint), `celebrate` (neon tint) | `components/empty-state.tsx` |
| `PremiumGate` | `from` key drives copy, `?from=` and analytics | `components/premium-gate.tsx` |
| `WawptnLogo` | Two sizes only: 16 px inline, 28 px header | `components/icons/wawptn-logo.tsx` |

Icons: `size-4` default, `size-3`/`3.5` in chips, `size-5` lists, `size-6`
hero and empty states; `size-N` rather than `w-N h-N`.

Decorative utilities in `index.css`: `.landing-gradient-text`,
`.text-gradient-warm`, `.neon-underline`, `.card-hover-glow`,
`.profile-player-card`, `.profile-holo-*`, `.profile-avatar-ring`,
`.profile-section-line`, `.profile-game-crown`, `.admin-badge`.

## Do's and Don'ts

**Do**
- Use semantic tokens (`text-reward`, `bg-success/15`) and the Badge variants for tinted chips.
- Use `shadow-1/2/3/glow`; extend the scale rather than writing a new shadow.
- Keep every interactive target at 44 px minimum.
- Write UI strings in `fr.json`, never hardcoded French in JSX.

**Don't**
- Raw Tailwind palette classes (`text-amber-500`, `bg-slate-700/30`).
- `rgba()` shadows, raw white (`text-white`, `border-white/10`).
- `text-xl` (step `text-lg` → `text-2xl`), off-rhythm spacing (`p-7`, `p-9`, `p-11`).
- A second icon library or a third logo size.

## Responsive

Mobile first. `sm` (640 px) switches Drawer → Dialog and input `h-11` →
`h-10`. `(pointer: coarse) and (max-width: 768px)` removes heavy blurs.
`(any-pointer: coarse)` forces 16 px inputs. Drawers get `overscroll-behavior:
contain` and `touch-action: pan-y`.

## Known Gaps

Found in the code, not fixed here.

1. **Raw shadows in Button**: `default` hover uses `shadow-[0_0_28px_oklch(0.55_0.27_270_/_0.25)]` and `steam` two raw `shadow-[…oklch(0.237_0.029_238…)]`, against the "don't roll your own shadow" rule.
2. **Raw white in Button `secondary`**: `border-white/[0.04]`, against the "no raw white" rule.
3. **Primary hard-coded in CSS utilities**: `oklch(0.55 0.27 270 / …)` is repeated in `.landing-*`, `.card-hover-glow`, `.neon-underline`, `.admin-badge`, `.profile-*` and the `premium-glow` keyframes instead of `var(--primary)`; reward `oklch(0.82 0.17 70)` and neon `oklch(0.82 0.19 190)` likewise.
4. **`--primary-foreground`** is `oklch(0.97 0.014 254.604)` (hue 254, the shadcn blue default) while every other neutral sits on hue 270–280.
5. **Three focus-ring alphas**: Button `ring-ring/50`, Input `ring-ring/40`, DropdownMenu items `ring-ring/60`; Checkbox and Dialog close use full `ring-ring`.
6. **`dark:` classes in `ui/checkbox.tsx`** with no `@custom-variant dark` in `index.css`: they follow the OS `prefers-color-scheme` in an app that is dark-only.
7. **`docs/design-system.md` drift**: says Button has "6 variants" then lists 7; cites the reduced-motion block at `index.css:647-656` (now l. 702–711) and mobile GPU relief at `253-262` under `(any-pointer: coarse)` (now l. 308–317, `(pointer: coarse)`); its radius table omits `3xl` and `4xl`.
