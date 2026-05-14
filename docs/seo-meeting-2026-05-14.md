# SEO Improvement Meeting — 2026-05-14

**Format:** Cross-functional working session, four personas.
**Scope:** Audit WAWPTN's current SEO posture and agree on a prioritized backlog.
**Attendees:**

- **Marcus Chen** — Technical SEO Specialist
- **Sofia Martínez** — Frontend Performance Engineer
- **Léa Dubois** — Content & UX Strategist
- **David Okafor** — Growth / Product-Led SEO

---

## 1. Framing (David opens)

> "Before we dive into checklists: WAWPTN is a Steam-OpenID-walled app for friend groups. Search intent for 'que jouer ce soir' is real but small. The dominant growth surface isn't Google — it's the **invite link pasted in Discord / WhatsApp / iMessage**. So when we say 'SEO,' I want us to include unfurl SEO (Open Graph, Twitter cards), not just SERP SEO. That's where the leverage is."

Léa concurs: "Authenticated content can't be indexed. Our public crawl surface is essentially `/`, `/join/:token`, and `/invite/:token`. If those three don't shine, nothing else matters."

---

## 2. Persona reports

### 2.1 Marcus Chen — Technical SEO

**Current state**

- Pure CSR SPA (React 19 + Vite + React Router). No SSR or prerender pipeline.
- Selective server-side OG rendering exists for `/share/vote/:sessionId` (well done) but not for the landing page or invite previews.
- `<html lang="fr">` correctly set in `packages/frontend/index.html:2`.
- Helmet CSP is configured; static assets cached `max-age=1y, immutable`; SPA shell `no-cache` (correct).
- **No `compression()` middleware** on Express.

**Critical gaps (ranked)**

1. **No `robots.txt` or `sitemap.xml`** in `packages/frontend/public/`.
2. **Landing page meta is static and thin** — `packages/frontend/index.html:9` has a 56-char French description and zero `og:*` / `twitter:*` tags on the root.
3. **No canonical link** in the shell.
4. **No JSON-LD** anywhere (no `Organization`, `SoftwareApplication`, or `Event` schema).
5. **`useDocumentTitle` updates `document.title` only** — does not update `og:title`, so social crawlers see stale tags on deep links.
6. **No response compression** on the backend.

**Recommended fixes**

- **P0:** Ship `robots.txt` + a generated `sitemap.xml` listing `/`, `/join/*` if intended public, etc.
- **P0:** Inject dynamic `og:*` / `twitter:*` into the HTML shell at Express level for `/` and `/join/:token` (User-Agent-agnostic — always send rich tags).
- **P1:** Add `app.use(compression())` after Helmet in `packages/backend/src/index.ts`.
- **P1:** Add `Organization` JSON-LD in `index.html` and `VotingEvent`/`Game` schema in vote-share routes.
- **P2:** Static `<link rel="canonical">` in `index.html`.

**Open questions**

- Are `/u/:userId` profile pages meant to be public-indexable?
- Production domain for canonical/OG URLs? (Backend currently derives from `req.protocol + req.host` in `invite.routes.ts:154`.)

---

### 2.2 Sofia Martínez — Performance & Core Web Vitals

> "Google rolled INP into Core Web Vitals last year. Our heavy `framer-motion` use on `VotePage` is fine UX, but it's a Lighthouse INP/TBT liability if it ships in the initial bundle."

**LCP risks**

- All page components imported eagerly in `App.tsx:5-15` — **no route-level `React.lazy`**. The landing page ships the full app bundle (React 19 + framer-motion ≈60KB gz + Radix + socket.io-client + i18next + Zustand + app code) on first paint.
- Google Fonts loaded as render-blocking stylesheets (`index.html:11-13`), two families, 8 total weights.
- `fetchUser()` runs synchronously at boot in `App.tsx:56`, gating render.

**INP risks**

- `framer-motion` on `VotePage.tsx` (≈1,097 lines, multiple `animate()` calls and variant trees) — large main-thread work on reveal.
- `prefers-reduced-motion` is respected at runtime but the motion code still loads.
- `socket.io-client` connects immediately after auth (`App.tsx:61`), competing for network/CPU on slow connections.

**CLS risks**

- Game grid is solid (`game-grid.tsx:753-760` has `width`/`height` + `aspect-[460/215]`).
- But `JoinPage.tsx:165`, `ProfilePage` lines 697/734, `UserProfilePage:199`, and the Radix `Avatar` wrapper all render `<img>` without explicit dimensions.

**Bundle observations**

- No `rollupOptions.output.manualChunks` in `vite.config.ts` — vendor isolation is whatever Vite's defaults produce.
- PWA caches Steam CDN images for 14 days (good for repeat).
- No Brotli/Gzip on dynamic responses.

**Recommended fixes**

- **P0:** Route-level `React.lazy` + `<Suspense>` in `App.tsx`. Expected savings: 100KB+ gz off the landing bundle, faster LCP/FCP.
- **P0:** Add `width`/`height` (or aspect-ratio container) to every `<img>` in the codebase. Sofia volunteered to enumerate offenders.
- **P1:** Defer `connectSocket()` until the user enters an authenticated route that needs it.
- **P1:** Self-host fonts with `font-display: swap`; drop unused weights.
- **P2:** `manualChunks` to isolate `framer-motion`, `socket.io-client`, Radix, `react-router-dom`.
- **P2:** Server `compression` middleware (Marcus also flagged).

---

### 2.3 Léa Dubois — Content, Semantics & i18n

> "The semantic foundation is actually strong on `VotePage` — `role="progressbar"`, live regions, `headingRef` focus management. That's better than most SaaS I audit. The problem isn't quality; it's **surface area**."

**Public surface**

- Public: `/` (LandingPage), `/join/:token` (JoinPage), `/invite/:token` (redirect).
- Everything else is Steam-OpenID gated.

**Per-page semantics**

- **LandingPage** — Single `<h1>` at line 120, `<main id="main-content">`, `<footer>`, semantic `<section>`s. Strong.
- **GroupsPage** — `<h1>` at `:274`, `<h2>` for "Autres groupes", `<main>` present, `role="search"` on the search bar. Good.
- **VotePage** — `<h1>` properly nested, `role="progressbar"` with full ARIA at `:838-843`, `aria-live="polite"` regions at `:460` and `:560`, decorative result image with `alt=""` at `:799`. Exemplary.
- **JoinPage** — **Missing `<main>` landmark** (wrapped in a plain `<div>` at `:95`). Fix this.

**i18n signals**

- `lang="fr"` ✓ (`index.html:2`).
- `i18next` wired across pages.
- **Title/description mismatch**: title is English (`"WAWPTN — What Are We Playing Tonight?"`), description is French. Pick French-first for the FR market.

**Accessibility issues that also hurt SEO**

- Icon-only paste button on `JoinPage:419` uses `title` only — needs `aria-label`.
- Some decorative `<svg>` outside button contexts lack `aria-hidden`.

**Recommended fixes**

- **P0:** Rewrite `<title>` and `<meta name="description">` in French, keyword-rich.
  - Title: `Que jouons-nous ce soir ? | Votez pour un jeu Steam en groupe`
  - Description (≈155 chars): `Que jouer ce soir avec vos amis ? WAWPTN trouve vos jeux Steam en commun et vous fait voter ensemble. Intégration Discord et lancement direct.`
- **P0:** Add a public `/groups/:id/preview` view (no auth) that crawlers can index — group name, member count, top games. Creates real indexable content.
- **P1:** Wrap `JoinPage` content in `<main id="main-content">`.
- **P1:** `aria-label` on icon-only buttons.
- **P2:** `<h2>` for unstyled section breaks on `VotePage` result screen ("Consensus", "Résultats précédents") and `GroupPage` history.

---

### 2.4 David Okafor — Growth & Acquisition Strategy

> "Honest take: classical SEO is a third-tier channel for WAWPTN. We need to stop treating this as 'how do we rank' and start treating it as 'how does every shared invite link sell itself'."

**Audit of social unfurls**

- `/share/vote/:sessionId` — **fully wired**. Backend produces a 1200×630 PNG via satori+resvg, sets `og:*` and `twitter:card`. This is the gold standard.
- `/join/:token` — **broken for unfurls**. The frontend fetches `InvitePreview` (group name, avatars, top 3 games, recent winner) client-side via `/api/invites/:token/preview` (JSON). Discord/Slack/iMessage crawlers see the generic landing-page meta. This is **the single highest-ROI fix in the room**.

**French keyword opportunities (realistic)**

- Primary: `choisir un jeu avec ses amis`, `quel jeu jouer ce soir`, `sélecteur de jeux multijoueur`, `jeux en commun Steam`.
- Long-tail: `jeu coop 4 joueurs Steam`, `bot Discord pour choisir jeu`.
- Caveat: this intent largely lives in Discord servers, not Google.

**Programmatic SEO**

- "Best N-player co-op under Xk on Steam" pages from aggregated vote data is *technically possible* but bounded by privacy (no exposing user libraries) and weak conversion intent. **Not recommended.**

**Three bets (ranked)**

1. **Ship `/share/join/:token` server-rendered HTML with OG tags** — group name, member count, member avatar stack, top game thumb. Mirror the vote-share pattern. **2–4 hours. 10× growth leverage.**
2. **List the Discord bot on top.gg** (`packages/discord/`). Free. Adds a discovery surface where the audience already lives.
3. **Own `que jouer ce soir` in French SERPs** — add 200–300 words of real prose to `LandingPage`, `FAQPage` JSON-LD, target position 4–6. Modest organic floor.

**What not to do**

- No blog. No "best games on Steam" content farm. No landing-page SEO before unfurls work.

---

## 3. Cross-persona consensus

Issues flagged by **two or more** personas:

| # | Issue | Flagged by | Severity |
|---|------|-----------|----------|
| 1 | **`/join/:token` has no server-rendered OG/Twitter meta** | Marcus, Léa, **David (top bet)** | **P0** |
| 2 | **Landing page title/description weak, mismatched language, no `og:*`** | Marcus, Léa, David | **P0** |
| 3 | **No `compression()` middleware on Express** | Marcus, Sofia | P1 |
| 4 | **Auth wall limits the SEO ceiling — need a public preview surface** | Léa, David | P0/P1 |
| 5 | **No `robots.txt` / `sitemap.xml`** | Marcus | P0 |
| 6 | **No route-level code splitting → bloated landing bundle** | Sofia | P0 |
| 7 | **Inconsistent `<img>` width/height → CLS risk** | Sofia | P0 |
| 8 | **No JSON-LD anywhere** | Marcus, David (FAQPage) | P1 |

---

## 4. Prioritized backlog (agreed)

### Sprint 1 — "Make every shared link sell itself" (1 week)

- [ ] **Server-render `og:*` / `twitter:*` for `/join/:token`** by mirroring the `/share/vote/:sessionId` pattern. Inject group name, member count, top-3 game thumbs into a dynamic OG image. *(David, Marcus — backend)*
- [ ] **Rewrite `<title>` and `<meta name="description">`** in French, keyword-rich, on the landing shell. *(Léa)*
- [ ] **Add static `og:*` / `twitter:*` + canonical** to `packages/frontend/index.html`. *(Marcus)*
- [ ] **Ship `robots.txt` and a minimal `sitemap.xml`** (root + any future public pages). *(Marcus)*
- [ ] **Add `app.use(compression())`** in `packages/backend/src/index.ts` after Helmet. *(Sofia)*

### Sprint 2 — "Trim the landing bundle" (1–2 weeks)

- [ ] **Route-level `React.lazy` + `<Suspense>`** in `App.tsx`. *(Sofia)*
- [ ] **Audit every `<img>` for `width`/`height`** — start with `JoinPage`, `ProfilePage`, `UserProfilePage`, Radix `Avatar` wrapper. *(Sofia)*
- [ ] **Self-host fonts** with `font-display: swap`, drop unused weights. *(Sofia)*
- [ ] **Defer `connectSocket()`** until first authenticated route mount. *(Sofia)*
- [ ] **Wrap `JoinPage` in `<main id="main-content">`** + `aria-label` on icon-only buttons. *(Léa)*

### Sprint 3 — "Earn an organic floor" (2–3 weeks, conditional on Sprint 1 metrics)

- [ ] **`Organization` + `SoftwareApplication` JSON-LD** in shell; **`FAQPage` JSON-LD** on landing. *(Marcus)*
- [ ] **Add ~300 words of French prose** to `LandingPage` targeting `que jouer ce soir`. *(Léa, David)*
- [ ] **Public `/groups/:id/preview` page** (read-only, no auth) — decide scope and privacy model. *(team review needed)*
- [ ] **List Discord bot on top.gg.** *(David)*
- [ ] **Vendor `manualChunks` in `vite.config.ts`.** *(Sofia)*

---

## 5. Open questions for product / leadership

1. Are `/u/:userId` profile pages intended to be **public-indexable**? Decision blocks Sprint 3 SSR work.
2. Are we comfortable shipping a **public group preview page** (member count + top games, no PII)? Léa and David both want this; Marcus needs it for the sitemap.
3. **Production canonical domain** — confirm so OG URLs don't drift between previews and prod.
4. Should the **English title** stay (brand recognition) or pivot to a **French-first title** (SEO)?

---

## 6. Success metrics (90 days)

- **Invite-to-signup conversion** from Discord/Slack/iMessage shares (Sprint 1 lever).
- **Lighthouse mobile**: LCP < 2.5s, INP < 200ms, CLS < 0.1 on landing (Sprint 2 lever).
- **Indexed-page count** in Google Search Console (Sprint 1+3 lever).
- **Brand-query CTR** on `que jouer ce soir` and variants (Sprint 3 lever, modest expectation).

---

*Meeting adjourned.*
