# Design / UX / Engagement Review — Multi-Persona Meeting

**Date:** 2026-05-08
**Branch:** `claude/design-review-personas`
**Scope:** WAWPTN frontend (`packages/frontend/`) — pages, components, design
tokens, microcopy, instrumentation, mobile ergonomics.
**Format:** Four design/product personas reviewed independently in
parallel; this document is the chaired synthesis of their reports.

## Participants

| Persona | Lens |
|---|---|
| Mobile UX & Performance | Touch targets, viewport, safe areas, gestures, perceived perf, asset weight, PWA |
| Visual Design System | Tokens, typography, spacing, motion, component variants, brand expression |
| IA / Navigation / a11y | Flows, page hierarchy, empty states, microcopy, focus management, contrast |
| Conversion & Engagement | Landing, viral moments, premium upsell, retention loops, instrumentation |

A finding flagged by multiple personas is consolidated. Severity is the
chair's, not the loudest persona's. Items disputed across personas are
called out.

---

## Executive summary

| Severity | Count | Notes |
|---|---|---|
| Critical | 5 | Landing has zero social proof; first-time solo user has no demo path; no share-prompt at group-create or after-result; premium page is conversion-blind; streaks/challenges invisible to users. |
| High | ~28 | `/admin` route unguarded, `DialogTestPage` in prod bundle, heading-order breaks, hardcoded i18n strings, multiple off-token colors, vote-card images without `loading="lazy"`, `max-h-[70vh]` on iOS instead of `dvh`, premium-gate fallback is generic. |
| Medium | ~32 | Touch-target shortfalls on dialog close + wishlist star, no `--warning`/`--info` tokens, persona hex colors bypass contrast system, badge variants don't cover real call-site mix, missing `inputMode`/`enterKeyHint` on inputs, focus management on notification panel, `EmptyState` not reused, premium contextual copy not wired. |
| Low | ~14 | Logo size drift (4 sizes), icon size drift, `text-white` instead of `text-foreground` in 3 places, footer contrast `/25` text, share-popover overflow on <360px viewport. |

**Top three actions for the next sprint (high impact × low effort):**

1. **Personality-led empty states + contextual premium gates.** Three of
   the four personas converged here. The empty state and the premium
   gate are the two surfaces a free user sees most, and both are
   currently generic. Replace `empty-state.tsx` with the WAWPTN "?"
   motif and per-context copy; pipe the actual limit being hit into
   `premium-gate.tsx` ("Tu utilises 2/2 groupes — l'illimité c'est
   3 €/mois"). Rough effort: 1–2 days. Likely lift: dramatic.
2. **Two viral moments fully wired.** (a) After group creation: replace
   "Aller au groupe" with a primary "Copier et partager sur Discord"
   that opens the link with rich preview text. (b) After result reveal:
   promote `ShareButton` from `outline sm` to default-size primary
   "Annoncer le verdict sur Discord", change Twitter copy from
   `"Ce soir on joue à {title}"` to `"{count} amis ont choisi {title}
   ce soir 🎮 #WAWPTN"`. Effort: ~1 day; lift on share-rate likely 2–4×.
3. **Landing rewrite for first impression.** Hero subhead at /70+
   contrast, lead-in benefit ("évite 30 minutes de débat"), add a
   social-proof strip ("X parties décidées cette semaine" — pulls from
   the existing `/api/events` aggregate), add a 4th section
   "Pourquoi pas un sondage Discord ?" articulating the Steam library
   moat. Effort: ~1 day; this is the conversion ceiling.

---

## A. Confirmed findings (multi-persona consensus)

### A1. `EmptyState` is generic and underused — **High**

Three personas flagged this. The component (`empty-state.tsx:29-30`) is
a muted icon + paragraph + button — no illustration, no playful copy,
no brand motif, even though `LandingPage.tsx:74` and
`GroupsPage.tsx:424` already use a giant question-mark watermark that
reads as the brand "?". And it's only used 3× — `game-grid.tsx:617,645`
and `VotePage.tsx:275`. Pages that should reuse it
(`GroupsPage.tsx:478-493` no-search-results, `JoinPage.tsx:271-279`
invite error, `UserProfilePage.tsx:85-99`) reinvent the pattern inline.

**Fix:** redesign `EmptyState` around the `?` motif (or a small
`WawptnLogo`), add a `tone: 'neutral' | 'warning' | 'celebrate'` prop,
migrate every inline reinvention to use it. Pass an optional `action`
prop so e.g. the "no active vote" state can offer "Lancer un vote"
instead of dead-ending at "back to group".

### A2. Premium gate is contextless — **High** (Critical for conversion)

`premium-gate.tsx:24-42` falls back to `t('premium.featureLocked')`
("Fonctionnalité Premium") without saying what feature is locked or
what unlocking buys. The contextual strings exist
(`fr.json:487-488`) but aren't wired in. The `groupLimitReached` toast
in `GroupsPage.tsx:143` likewise navigates to `/subscription` without
passing through which limit was hit, so the destination page can't
recap their state.

**Fix:** require a `feature` prop on `PremiumGate`; render specific
copy like "Tu utilises 2/2 groupes gratuits — passe à l'illimité pour
3 €/mois". Pass the same context as a query param to `/subscription`
and surface a banner on arrival.

### A3. `/admin` route mounts before the redirect runs — **High**

`App.tsx:106` has no synchronous guard. `AdminPage.tsx:516` returns
`null` and `:321` redirects in an effect, but `loadData()`/`loadUsers()`
fire before that. A non-admin authenticated user can briefly hit admin
endpoints.

**Fix:** wrap the route in a `<RequireAdmin>` wrapper that returns
`<Navigate to="/" replace />` synchronously — same shape as the existing
auth guards at `App.tsx:88-97`.

### A4. `DialogTestPage` ships in the production bundle — **High**

`App.tsx:18` statically imports it; `App.tsx:65-71` only gates the
*route registration* on `import.meta.env.DEV`. The dead code is in the
bundle.

**Fix:** `const DialogTestPage = lazy(...)` inside the DEV branch, or
strip the route entirely with a Vite `define` flag.

### A5. `<h1>` order breaks on `GroupsPage` welcome and `UserProfilePage` — **High**

`GroupsPage.tsx:429` uses `<h3>` for "Bienvenue sur WAWPTN !" inside
the empty state while the page `<h1>` is hidden behind the giant "?"
watermark. `UserProfilePage.tsx:88` and `ComparePage.tsx:75/121` have
`<h2>` with no preceding `<h1>` in branches; the success branch's only
`<h1>` is `sr-only` (`ComparePage.tsx:149`).

**Fix:** promote welcome heading to `<h2>` after a real visible `<h1>`,
or hide the page `<h1>` and use the welcome copy as the actual heading.
Sighted users also benefit from a consistent visible page title.

### A6. Hardcoded French strings outside `t()` — **High**

IA persona flagged 9+ files (`group-sidebar.tsx:74-80,187,210`,
`vote-setup-dialog.tsx:264,269,274,278`, `UserProfilePage.tsx:88-94`
through `:183`, `ComparePage.tsx:75-78,121,149`,
`AdminPage.tsx:113,544,547,552`). The strings are conceptually the same
as keys that exist in `fr.json` (`groups.onlineCount_other` etc).
Outside the i18n system entirely.

**Fix:** migrate each to `t()` keys, surface in `fr.json`, plus a lint
rule to catch raw French in JSX.

### A7. Token discipline drift — **High**

Visual persona logged 23 issues. Concentrated in three places:
- `challenge-card.tsx:8-10` uses `amber-700` / `slate-400` /
  `yellow-500` — only place in the codebase using the raw Tailwind
  amber/slate/yellow.
- `VotePage.tsx:366,538,827,854-856` and `admin-health-card.tsx:43-44`
  use `rgba(...)` shadow values for primary/destructive/success.
- `JoinPage.tsx:207-209`, `vote-setup-dialog.tsx:272`,
  `game-grid.tsx:630-638` use `amber-500` for "warning" — there is no
  `--warning` token at all in `index.css`.

**Fix:** add `--warning` and `--info` tokens to `index.css:5-56`;
migrate the four `rgba(...)` shadow sites to
`oklch(var(--primary) / 0.45)` form; rewrite challenge tiers around the
existing `--ember` / `--neon` / `--reward` semantic tokens.

### A8. Vote-card images miss `loading="lazy"` and dimensions — **High**

`VotePage.tsx:480-486` (vote ballot) and `:951-955` (game-detail dialog
hero) have no `loading`, no `width`/`height`, no `onError`. With ~50
games on a slow 4G connection this hammers the radio with parallel
fetches and causes CLS as 460×215 placeholders pop in. The pattern is
already correct in `game-grid.tsx:738-741`.

**Fix:** copy the pattern — `loading="lazy"`, `width=460`, `height=215`,
`decoding="async"`. For the dialog hero use `loading="eager"` since it's
in-viewport.

### A9. `max-h-[70vh]` on iOS Safari — **High**

`game-grid.tsx:660-664` (virtualized scroll) and `:444` (mobile filter
drawer body) use `vh` not `dvh`. iOS URL-bar collapse causes viewport
jumps; the bottom row hides under the address bar.

**Fix:** swap to `dvh` everywhere — the codebase otherwise uses `dvh`
consistently.

### A10. Touch-target shortfalls — **Medium**

- `ui/dialog.tsx:48-51` close button is a 16-20px X. Below WCAG 2.5.5.
- `game-grid.tsx:786-803` wishlist star is `h-7 w-7` (~28px) and
  overlaps the card image button — mistaps trigger the tooltip.
- `vote-setup-dialog.tsx:380-387` `datetime-local` is borderline `~40px`.

**Fix:** enforce `min-h-[44px] min-w-[44px]` on all icon-only buttons;
move the wishlist star out of the card image's hit zone or expand its
hit area via `before:`.

### A11. Inputs miss `inputMode` / `enterKeyHint` / `autoComplete` — **Medium**

Across `group-sidebar.tsx:518-519`, `vote-setup-dialog.tsx:380`,
`GroupsPage.tsx:316,367`, `VotePage.tsx:432-439`. The invite-token
paste especially needs `autoCorrect="off" autoCapitalize="none"
spellCheck={false}` — iOS will helpfully capitalize the token and break
the paste.

**Fix:** ship sensible defaults via the base `Input` component and
override per-field where useful (e.g. `inputMode="numeric"` for cron).

---

## B. Conversion & engagement (Critical / High)

### B1. Landing page is conversion-blind — **Critical**

No social proof anywhere in `LandingPage.tsx:53-415`. No user count,
group count, vote count, testimonials, Discord-server count.
"Populaire" badge (`LandingPage.tsx:349-351`) is on the *paid* plan —
dishonest framing rather than proof. Hero subhead is rendered at
`text-foreground/40` to `/45` to `/25` — the strongest line ("100%
gratuit · Aucun mot de passe · Prêt en 30 secondes", `fr.json:435`) is
nearly invisible.

**Fix:** (a) Bump opacity on subhead/lead-in to `/70+`. (b) Add a stats
strip below the CTA pulling from existing `/api/events` aggregates.
(c) Add a "Pourquoi pas un sondage Discord ?" section articulating the
Steam library auto-detection moat.

### B2. First-time solo user has no demo — **Critical**

Empty `GroupsPage.tsx:415-477` offers "Créer un groupe" or "Rejoindre"
— but a user logging in alone has no friends yet, nothing to vote on,
nothing to share. They bounce.

**Fix:** ship a `/demo` group seeded server-side with public faces and
5 popular games so the user can experience the result-reveal screen
before inviting anyone.

### B3. Two viral moments are silent — **Critical**

(a) After group creation, `GroupsPage.tsx:341-352` shows
`<InviteLink/>` but the only CTA is "Aller au groupe". The user must
manually find the copy/Discord buttons inside.
(b) After result reveal, `VotePage.tsx:885-897` has a `ShareButton`
but it's `outline sm` next to a 14-h pulsing primary "Lancer sur
Steam". Share is sibling-tertiary.

**Fix:** (a) auto-trigger Web Share API (or a "Copier et partager sur
Discord" primary CTA) when the group-creation success dialog opens.
(b) Promote `ShareButton` on the result screen to default-size primary;
copy: "Annoncer le verdict sur Discord". (c) Twitter share copy
(`fr.json:545`): `"{count} amis viennent de voter {title} ce soir 🎮
#WAWPTN"`.

### B4. Premium funnel is uninstrumented — **Critical**

`analytics.ts:20-32` `AnalyticsEvent` union has no
`premium.gate_shown`, `premium.upgrade_clicked`,
`premium.checkout_started`, `premium.checkout_completed`.
`SubscriptionPage.tsx:34-43` `handleCheckout` doesn't call `track()`.
Without these, conversion can't be measured or A/B-tested.

**Fix:** add the four events; fire `gate_shown` from `PremiumGate`,
`upgrade_clicked` from gate-CTAs, `checkout_started` from
`SubscriptionPage`, `checkout_completed` from a Stripe success
webhook callback (or the `?success=true` landing).

### B5. Streaks and challenges invisible — **Critical (retention)**

Backend `streaks.ts` exists and surfaces streaks via API; `grep -rn
"streak" packages/frontend/src` returns zero hits. Challenges
(`challenge-card.tsx`) are only shown on the Profile page
(`ProfilePage.tsx:764-779`) — buried.

**Fix:** display "🔥 3 sessions cette semaine" on `GroupsPage` above
the list and on each `GroupCard`. Surface "next challenge: 2/3 votes
ce mois" on `GroupPage` and result reveal.

### B6. Subscription page is conversion-blind — **High**

`SubscriptionPage.tsx:111-135`, `fr.json:465-481` lists 3 of the 6
premium features, no testimonials, no "rejoins X soutiens", no annual
plan, no first-month-free, no coupon UI. Stripe checkout is one-click
but optimization-blind.

**Fix:** add an annual SKU with a discount; surface supporter count;
honor `?coupon=` URL param; list all 6 premium features with concrete
numbers.

### B7. Auto-vote is gated to premium but it's the strongest habit loop — **High**

`group-sidebar.tsx:343-368`. Free users never get the
"every Friday at 20h" loop, so they don't form the habit they would
later pay to keep.

**Fix:** offer auto-vote during a 14-day premium trial (or the first
month free), then gate. Habit must form before paywall.

---

## C. Mobile / performance (Medium / Low)

| # | Location | Issue / Fix |
|---|---|---|
| C1 | `game-grid.tsx:259-263, 660-664` | Virtualizer reads `offsetWidth` synchronously; `columnCount` change doesn't re-measure → row jitter on rotation. **Fix:** call `virtualizer.measure()` after `setColumnCount`. |
| C2 | `game-grid.tsx:716-825` | `GameCard` not memoized — every visible card re-renders on slice change. **Fix:** wrap in `React.memo`. |
| C3 | `GroupsPage.tsx:102-122` | Manual pull-to-refresh fires `setPullDistance` on every touch event → jank. **Fix:** throttle via `requestAnimationFrame`. |
| C4 | `share-button.tsx:153` | Centered popover overflows viewport <360px. **Fix:** right-align or use Radix Popper portal. |
| C5 | `ui/dialog.tsx:42` | No `max-h` on Dialog — long forms overflow on tablet portrait. **Fix:** `max-h-[calc(100dvh-2rem)] overflow-y-auto`. |
| C6 | `notification-bell.tsx:131` | Per-row stagger `delay: i * 0.03` drops frames on long lists. **Fix:** cap stagger when `length > 8`. |
| C7 | `tonight-pick-hero.tsx:172-178, 187-192` | Hero loads two copies of the same Steam header eagerly. **Fix:** reuse one or set duplicate to lazy + `fetchPriority="low"`. |
| C8 | `index.css:606-610` | iOS input zoom prevention is correctly keyed on `any-pointer: coarse`. **Verified safe.** |
| C9 | `vite.config.ts:62-110` | Workbox caching is aggressive and well-tuned. **Verified safe.** |
| C10 | Vote-card scrollable wrapper at `VotePage.tsx:443-526` lacks `touch-scroll` class (defined `index.css:613-616`). **Fix:** add it. |

---

## D. Visual / token (Medium / Low)

| # | Location | Issue / Fix |
|---|---|---|
| D1 | Border-radius drift — `Card` `xl`, `Button` `lg`, `Badge` `md`, `Dialog` `lg`. | Codify a 3-step radius scale (control / surface / sheet); align components. |
| D2 | Shadow scale is bespoke per component. | Define `--shadow-1/2/3` (incl. primary-tinted variant); replace ad-hoc box-shadows. |
| D3 | `ui/badge.tsx:5-19` only 4 variants but call sites override with `bg-primary/10 …`, `bg-score-good/10 …`, `bg-reward …`. | Add `success`, `score-good/mixed/bad`, `reward`, `info` variants. |
| D4 | `ui/card.tsx:18,35,41` hard-codes `p-4`. | Add `padding: 'sm'|'md'|'lg'` cva variant. |
| D5 | `--font-heading` (Bricolage Grotesque) never set as default for `h1/h2/h3`. `CardTitle` (`ui/card.tsx:23`) renders in Plus Jakarta Sans. | `@layer base { h1,h2,h3 { font-family: var(--font-heading) } }` plus set on `CardTitle`. |
| D6 | `--chart-1`…`--chart-5`, `--sidebar-*` tokens are inherited shadcn dead weight (0 hits in TSX). | Strip or use them. |
| D7 | `wawptn-logo.tsx:23-25, 44` SVG hexes don't match `--primary` token — two purples on screen. | Pick one source of truth. |
| D8 | `persona-badge.tsx:84-117` injects raw hex per persona — bypasses contrast system. | Wrap incoming color through a saturation/contrast clamp helper, or constrain to a palette. |
| D9 | Logo size drift across 4 places (16/18/20/28). | Pick 2; document. |
| D10 | Icon sizing — `w-4 h-4` (109), `w-3.5 h-3.5` (39), `w-3 h-3` (33) etc. | Adopt `size-4`/`size-5` consistently. |
| D11 | `ProfilePage.tsx:712,715` uses `text-white` instead of `text-foreground`. | Migrate. |
| D12 | Footer `text-muted-foreground/50/45/25` — likely below WCAG AA on dark bg. | Use solid `text-muted-foreground` or test ≥4.5:1. |
| D13 | `share-button.tsx:154` `shadow-lg` while `notification-bell.tsx:131` is `shadow-md`. Same surface, different shadow. | Pick one popover shadow. |

---

## E. IA / a11y / microcopy (Medium / Low)

| # | Location | Issue / Fix |
|---|---|---|
| E1 | `notification-bell.tsx:124-131` | `role="dialog"` without `aria-modal`, focus trap, or focus restore. Also conflicts with `aria-haspopup="menu"` at `:93`. **Fix:** use Radix `Popover`/`DropdownMenu` or add focus trap + restore. |
| E2 | `GroupsPage.tsx:452-460` | `aria-hidden="true"` on the sticky selection counter — SR users lose the count when scrolled. **Fix:** wrap in polite live region or remove `aria-hidden`. |
| E3 | `VotePage.tsx:451-461` | `role="list"` on `<div>` of `role="listitem"` `<div>`s — SR hears "list, button" twice. **Fix:** use `<ul>`/`<li>` or drop redundant roles. |
| E4 | `LandingPage.tsx:74-88` | Decorative `?` motion.span lacks `aria-hidden="true"` (the `GroupsPage.tsx:422-427` one correctly has it). **Fix:** match. |
| E5 | `tonight-pick-hero.tsx:188` | Visible thumb has `alt={game.gameName}` while the background image is correctly `alt=""`. Game name announced twice. **Fix:** `alt=""` on the visible thumb since the heading already carries the name. |
| E6 | `error-boundary.tsx:32, 34, 35` | Default fallback strings drop accents ("mal passe", "Retour a l'accueil"). **Fix:** add accents or rely on `t()` keys. |
| E7 | `/invite/:token` deep link unhandled — `InviteLink` and `GroupsPage.tsx:67` build URLs at `/invite/...` but the router only knows `/join/...`. **Fix:** add a redirect route. |
| E8 | No persistent "Mes groupes" anchor in header — nested routes rely on per-page back buttons. **Fix:** add a breadcrumb or persistent link. |
| E9 | Vote screen lost-connection state is invisible — `App.tsx:62` toasts on disconnect but `VotePage` waiting screen freezes silently. **Fix:** inline indicator wired to `useSocketConnectionStatus`. |
| E10 | Voice mixing (tu/vous) — `vote.notParticipant` "Tu ne participes pas" vs `joinGroup.required` "Veuillez". **Fix:** pick one register. |

---

## F. Verified safe / done well (consensus)

- **Viewport meta** with `viewport-fit=cover` (`index.html:7`); `dvh` used consistently outside the issues above; safe-area insets honored on all three fixed bottom bars.
- **`Button` enforces `min-h-[44px]`** (`ui/button.tsx:20-23`), iOS input zoom prevented (`index.css:606-610`), `touch-action: manipulation` global.
- **Skip-to-content link** (`app-header.tsx:50-52`).
- **Reduced-motion** comprehensively honored — global `!important` override at `index.css:647-656` plus per-component opt-outs; mobile GPU relief stripping blurs on `any-pointer: coarse ≤768px`.
- **Workbox caching** is well-tuned: 2-week TTL on Steam images, NetworkFirst with 3s timeout for API GETs (`vite.config.ts:62-110`).
- **Auth-gated routing** at `App.tsx:88-97` is clean — unauth gets only Landing/Join/Discord-link.
- **Form labels** consistently use `<label htmlFor>` (`GroupsPage.tsx:312`, `:363`; `group-sidebar.tsx:511`, etc.).
- **Result reveal choreography** (`tonight-pick-hero.tsx:167-296`, `VotePage.tsx:584-921`) is genuinely a "ta-da" — spring image reveal, count-up consensus bar, confetti, pulsing CTA, launch-timeout safety toast. Only gap is share demotion (B3).
- **`/invite/:token` server-side OG preview** is rich (avatars, recent winner, top 3 games) — strong viral magnet on Discord unfurls.
- **Funnel events** for the *core* steps are tracked: login, group.created/joined, invite.copied/shared, vote.started/completed, game.launched_in_steam (`analytics.ts:20-32`). The gap is premium events.
- **Per-participant progress dots** (`VotePage.tsx:351-373`) with `aria-label` per dot — a great IA touch.
- **JoinPage in-app-browser warning** (`JoinPage.tsx:205-249`) — excellent dead-end prevention. Should be hoisted to `LandingPage` too.
- **Single icon library** (lucide-react), zero mixes.
- **OKLCH design tokens** are modern and gamut-safe.

---

## G. Open questions / experiments

1. **Light mode**: codebase commits fully to dark — is this permanent? If yes, purge the inherited shadcn `dark:` selectors and the `--chart-*`/`--sidebar-*` dead tokens.
2. **Mascot**: the playful brand promises a character that the empty/error/success states don't deliver. Worth a quick brand exercise.
3. **A/B tests worth running:** social-proof strip on landing hero; primary "Partage le verdict" on result reveal; annual plan with 20% off; first-month-free coupon scoped to invite arrivals.
4. **PWA install prompt**: no `beforeinstallprompt` handler — does the app surface "Install" anywhere, or rely on browser-supplied affordances? Chrome's mini-infobar is deprecated.
5. **Gestures** verified absent: swipe-right-to-thumbs-up, long-press for game details, swipe-to-dismiss notifications. Tap-only voting today — is this intentional?
6. **Tonight reminder push** at 19:30 local for users with auto-vote disabled — measure return rate.
7. **Streak surfacing** is the single biggest retention experiment available.

---

## H. Suggested sequencing

**Sprint 1 — conversion ceiling (1 week):**
- B1, B3 (landing rewrite + viral moments wired)
- A2 (premium gate contextual)
- B4 (premium events instrumented)
- A1 (empty-state redesign)
- A8 (vote-card image lazy + dimensions)

**Sprint 2 — retention loop (1 week):**
- B2 (demo group)
- B5 (streaks/challenges surfaced)
- B6 (subscription page social proof + annual plan)
- B7 (auto-vote trial)
- A6 (i18n migration sweep)

**Sprint 3 — polish & a11y (1 week):**
- A3, A4, A5 (admin guard, DialogTestPage code-split, heading order)
- A7, D1-D5 (token discipline, radius/shadow/badge variants)
- A10, A11 (touch targets + input hints)
- A9, C10 (vh→dvh, touch-scroll)
- E1, E2, E3 (notification panel a11y, live regions, list semantics)

**Sprint 4 — design system docs:**
- Document the type scale, spacing scale, radius scale, shadow scale, opacity scale.
- Lint rule for raw French strings in JSX.
- Lint rule for raw color hexes outside `index.css`.

---

*Generated by parallel persona subagents and chaired synthesis. Findings
referencing line numbers were not all individually re-verified against
source — treat line numbers as starting points, not ground truth.*
