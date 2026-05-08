# WAWPTN Design System

**Last updated:** 2026-05-08 (after design-review sprints 1-6)

This document captures the design tokens, scales, and component
conventions that power the WAWPTN frontend. It exists so the team —
and any future review pass — has a single source of truth instead of
inferring rules from the codebase.

The system is dark-only by deliberate brand choice ("Neon Dusk" — see
`packages/frontend/src/index.css`). Tailwind v4 with `@theme inline`
exposes every token below as a utility class.

---

## Color tokens

All colors are authored in **OKLCH** for perceptual uniformity and
gamut safety. Tokens live in `packages/frontend/src/index.css` `:root`
and are exposed via the `@theme inline` block as `--color-<name>`.

### Surface

| Token | Use |
|---|---|
| `background` | App-wide background — body and full-bleed surfaces |
| `foreground` | Default body text |
| `card` | Elevated surface (slightly lighter than background) |
| `card-foreground` | Text on cards |
| `popover` | Floating surface (tooltips, dropdowns, share popover) |
| `muted` | De-emphasized surface — placeholder rows, disabled states |
| `muted-foreground` | De-emphasized text |
| `accent` | Subtle hover/focus highlight |
| `border`, `input` | Hairlines and field outlines (alpha-based) |
| `ring` | Focus ring color |

### Brand & semantic

| Token | Lens | Where to use |
|---|---|---|
| `primary` | Brand purple | Primary CTAs, hero gradients, focus rings |
| `secondary` | Recessed | Secondary buttons, neutral chips |
| `destructive` | Error / danger | Delete, kick, cancel-with-loss |
| `success` | Positive confirmation | "Operational", health-up, vote success |
| `warning` | Caution without alarm | Invite-link issues, "no common games", in-app browser warning |
| `info` | Neutral attention | Reserved — adopt as needed |
| `reward` | Premium / accomplishment | Crown icons, premium gates, challenges, gold tier |
| `neon` | Cool accent | Wishlist hint, secondary highlights, silver tier |
| `ember` | Warm accent | Bronze tier, warmth callouts |

Each `*-foreground` variant exists where a surface needs guaranteed
contrast on top of its tinted background.

### Domain-specific

| Token | Use |
|---|---|
| `steam` / `steam-light` / `steam-foreground` | Steam-branded buttons (login, "Launch in Steam") |
| `online` | Presence dot color |
| `score-good` / `score-mixed` / `score-bad` | Metacritic ranges |

### Don'ts

- **Do not** use raw Tailwind palette utilities (`text-amber-500`,
  `border-yellow-600/40`, `bg-slate-700/30`). Migrate to a semantic
  token. The visual-design review caught the last 4 amber-500 sites
  in sprint 2 and the challenge-card amber/slate/yellow tiers in the
  same sprint.
- **Do not** drop `rgba(...)` shadows. Use `oklch(... / alpha)` so the
  shadow tracks any future palette tweak. The `--shadow-glow` token
  already encodes the canonical primary-tinted halo.
- **Do not** use raw white. Replace `text-white`, `border-white/10`
  with `text-foreground`, `border-foreground/10`. The single audited
  exception is the holographic-card overlay text in `ProfilePage.tsx`,
  which has been migrated.

---

## Typography

| Token | Family | Use |
|---|---|---|
| `--font-sans` | Plus Jakarta Sans | Body, labels, controls |
| `--font-heading` | Bricolage Grotesque | Headings, display text |

`@layer base` in `index.css` applies `font-family: var(--font-heading)`
to every `h1`-`h6` automatically. `CardTitle` (a `<div>`) carries
`font-heading` explicitly because the base rule can't reach it.

### Size scale

The codebase mostly uses Tailwind defaults. Histogram of usage as of
sprint 6:

```
text-sm    148   ← body / dense contexts
text-xs    145   ← labels, captions
text-2xl    35   ← page titles
text-lg     17
text-base   14
text-3xl    12   ← display moments
text-xl      8
```

Two informal rules:

1. Skip `text-xl` (only 8 sites). Step from `text-lg` → `text-2xl`.
2. Reach for `clamp(...)` only on the landing page hero. Everywhere
   else, prefer the discrete scale above so spacing stays predictable.

---

## Spacing & radius

### Spacing scale

Tailwind's 4px base. The lint rule of thumb: stick to the canonical
scale (`p-1`, `p-2`, `p-3`, `p-4`, `p-6`, `p-8`). Specifically avoid
`p-7`, `p-9`, `p-11` — they read as overrides of the rhythm rather
than a deliberate choice.

### Radius scale

| Token | Tailwind | Use |
|---|---|---|
| `rounded-sm` | `radius * 0.6` | Tooltip/dropdown items |
| `rounded-md` | `radius * 0.8` | Badges, dialog close, popover items |
| `rounded-lg` | `radius * 1.0` (default) | Buttons, inputs, dialogs |
| `rounded-xl` | `radius * 1.4` | Cards, list items |
| `rounded-2xl` | `radius * 1.8` | Large illustrative cards (profile holo, group hero) |

The base `--radius` is `0.625rem` (10px); changing it scales the whole
system.

### Shadow scale (sprint 3)

| Token | Use |
|---|---|
| `shadow-1` | Cards, panels — subtle drop |
| `shadow-2` | Tooltips, dropdowns, popovers — mid |
| `shadow-3` | Dialogs, sheets — strongest |
| `shadow-glow` | Primary-tinted halo on hero CTAs and Drawer handles |

Every popover surface (Tooltip, DropdownMenu, share-button menu,
notification panel, cron-autocomplete) uses `shadow-2`. Dialog uses
`shadow-3`. Card uses `shadow-1`. Don't roll your own
`shadow-[0_2px_12px_...]` triplet — extend the scale if you need a
new step.

---

## Iconography

Single library: **lucide-react**. No mixes.

### Size discipline (sprint 6)

Prefer `size-N` over `w-N h-N` for square icons:

| Class | Pixels | Use |
|---|---|---|
| `size-3` | 12 | Inline-with-text badges, tight chips |
| `size-3.5` | 14 | Compact icon buttons inside chips |
| `size-4` | 16 | **Default body-icon size** — most call sites |
| `size-5` | 20 | Page-level affordances, lists |
| `size-6` | 24 | Hero cards, empty states |

Sprint 6 ran a mechanical pass collapsing 336 paired `w-N h-N`
sites to `size-N`. Going forward, write `size-N` from the start;
`w-N h-N` is reserved for genuinely non-square layouts (Steam capsule
thumbnails `w-16 h-8`, Drawer handle bar `h-1.5 w-12`).

### WawptnLogo (sprint 4)

Two canonical sizes:

| Pixels | Where |
|---|---|
| 16 | Inline contexts — footer, pricing card, alongside body copy |
| 28 | App-header brand mark |

Adding a third should be a deliberate design choice, not drift.

---

## Component conventions

### Buttons (`components/ui/button.tsx`)

- 6 variants: `default | destructive | outline | secondary | ghost |
  link | steam`
- 4 sizes: `default | sm | lg | icon`
- Every size enforces `min-h-[44px]` (and `icon` adds `min-w-[44px]`)
  — Apple HIG / Material AAA compliant.
- Default variant carries `shadow-glow` for the primary-tinted halo.

Don't override variants with raw Tailwind classes (`className=
"bg-primary/10 text-primary border-primary/20"`). If a call site
needs that pattern, the **Badge** variant set probably already covers
it (sprint 3 added `success`, `warning`, `info`, `reward`,
`scoreGood/Mixed/Bad` — see `components/ui/badge.tsx`).

### Card (`components/ui/card.tsx`)

`CardHeader`, `CardContent`, `CardFooter` accept a `padding` prop:

| Value | Padding |
|---|---|
| `none` | 0 |
| `sm` | `p-3` |
| `md` *(default)* | `p-4` |
| `lg` | `p-6` |

`CardContent` and `CardFooter` zero their top padding (`pt-0`) when
they sit beneath a `CardHeader` so the content doesn't double up on
the header's bottom rhythm.

### Dialog vs Drawer

`ResponsiveDialog` (`components/ui/responsive-dialog.tsx`) picks the
right primitive at the `sm` breakpoint:

- `< 640px`: Vaul `Drawer` from the bottom — `pan-y` gesture, 96dvh
  cap, edge-swipe-to-close honors iOS gesture conflicts.
- `>= 640px`: Radix `Dialog` centered — `100dvh-2rem` cap so long
  forms scroll instead of overflowing the viewport on tablet portrait
  (sprint 3).

`Dialog`'s close button is now 44×44 with a visible `aria-label="Fermer"`
(sprint 3, A10 fix).

### Popover-shaped surfaces

The Notification bell uses a focus-trap pattern (sprint 3):

- Trigger ref + panel ref
- `aria-haspopup="dialog"` + `aria-modal="true"` + panel `tabIndex={-1}`
- `closePanel` helper restores focus to the trigger
- Escape and click-outside both close

Use the same pattern when you build a similar surface; don't
re-implement focus management ad hoc.

### Empty states (`components/empty-state.tsx`)

Personality-led wrapper around the brand `?` watermark. Three tones:

| Tone | Color treatment | Use |
|---|---|---|
| `neutral` *(default)* | Foreground-tinted ring | "No groups yet", "no active vote" |
| `warning` | Reward-tinted | Invite errors, dead links |
| `celebrate` | Neon-tinted | Completed challenges, milestones |

Optional `secondaryAction` slot for "create / join" dual paths.

### Premium gate (`components/premium-gate.tsx`)

Takes a `from: 'auto_vote' | 'recommendations' | 'group_limit' |
'member_limit' | 'history' | 'feature'` key that drives:

1. Per-context title, description, and benefits list (i18n keys
   `premium.gateTitle.*`, `premium.gateDescription.*`,
   `premium.gateBenefits.*`).
2. `?from=` URL param to `/subscription` so the destination shows
   recap copy.
3. Analytics attribution: `premium.gate_shown` and
   `premium.upgrade_clicked` events both carry `from`.

Always pass `from` at call sites. The default `'feature'` is reserved
for surfaces that genuinely don't have an attribution.

---

## Motion

- Standard easing: `cubic-bezier(0.22, 1, 0.36, 1)` — warm-out curve
  used across CSS transitions and Framer variants.
- All animation respects `prefers-reduced-motion` via
  `index.css:647-656` (a global `!important` override) plus
  per-component opt-outs (`useReducedMotion()`).
- Mobile GPU relief: blurs and fog-drift are stripped on
  `(any-pointer: coarse) and (max-width: 768px)` — see
  `index.css:253-262`.

---

## a11y

- Skip-to-content link in `app-header.tsx:50-52`.
- `font-size: 16px` on coarse-pointer inputs prevents iOS zoom.
- `touch-action: manipulation` global on every button/link.
- Focus rings on every primitive (Button, Input, Textarea, Checkbox,
  Badge outline, Dialog close, Dropdown).
- `EmptyState` and decorative landing `?` carry `aria-hidden="true"`
  so SR readers don't announce a meaningless character.
- The notification panel uses focus management (see above).

---

## i18n

- Default: French (`fr`). Fallback: French. UI strings live in
  `packages/frontend/src/i18n/locales/fr.json`.
- Plural forms use the `_one` / `_other` suffix convention
  (`onlineCount_one`, `lastSeen.minutesAgo_one`, etc.).
- Embedded markup uses `<Trans>` with positional `<0>...</0>`
  components — see `UserProfilePage.tsx` for the canonical example.

Don't write hardcoded French in JSX. The IA review caught 9+ files
in sprint 2 and the UserProfilePage / ComparePage refactor in
sprint 4 closed the rest.

---

## Open / followups

These items are intentionally not codified — they need design or
product input first:

- **Light mode** — codebase is dark-only. The dead `dark:` selector
  in `ui/checkbox.tsx` is shadcn template fallout; remove if light
  mode stays off-roadmap.
- **Logo gradient harmonization (D7)** — DONE in sprint 7. The
  `color` variant's gradient now uses OKLCH values that mirror
  `--primary` and `--reward`. Update the stops in
  `components/icons/wawptn-logo.tsx` if the brand tokens evolve.
- **Persona color clamp (D8)** — DONE in sprint 8. Embed colors now
  flow through `lib/persona-color.ts:clampPersonaColor()` which snaps
  HSL lightness to [0.55, 0.78] and saturation to [0.45, 0.85] before
  rendering. Hue is preserved so each persona keeps its identity.
- **Type scale shrink** — drop `text-xl` (only 8 hits).
- **Annual subscription plan + first-month-free coupon** — backend
  Stripe SKU work needed.
