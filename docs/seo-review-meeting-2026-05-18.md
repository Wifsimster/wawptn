# SEO Review Meeting — 2026-05-18

**Format:** Follow-up review session, four personas.
**Scope:** Re-audit WAWPTN's SEO posture against the 2026-05-14 backlog — verify what shipped, what slipped, and re-prioritize the remainder.
**Prior session:** `docs/seo-meeting-2026-05-14.md`.
**Attendees:**

- **Marcus Chen** — Technical SEO Specialist
- **Sofia Martínez** — Frontend Performance Engineer
- **Léa Dubois** — Content & UX Strategist
- **David Okafor** — Growth / Product-Led SEO

---

## 1. Framing (David opens)

> "Four days, and most of Sprint 1 *and* chunks of Sprint 2 and 3 are live. The team didn't sandbag — `robots.txt`, `sitemap.xml`, the full OG/Twitter/JSON-LD block on the shell, server-rendered invite previews with a dynamic OG image, route-level code splitting, vendor chunking, `compression()`. That's the whole 'make every shared link sell itself' thesis, shipped. So today is a *review*, not a re-audit from zero. Three questions: did the P0s land correctly, what regressed or got missed in the rush, and what's the next dollar of leverage."

Marcus, for the record: "Two of my flags I want verified live before we rank them — the `/invite/` vs `/join/` URL split, and whether `trust proxy` is set behind Traefik. I'll mark them VERIFIED below where the meeting checked the code in-session."

---

## 2. Persona reports

### 2.1 Marcus Chen — Technical SEO

**Shipped since 05-14**

- **`robots.txt`** — `packages/frontend/public/robots.txt`. Allows `/$`, `/share/`, `/invite/`, static assets; disallows `/api/`, `/groups`, `/profile`, `/admin`, `/join/`; declares the `Sitemap:` line. ✅
- **`sitemap.xml`** — `packages/frontend/public/sitemap.xml` (root URL only). ✅
- **Shell meta** — `index.html` now ships a French keyword-rich `<title>` (`:74`), a 161-char French description (`:9`), `<link rel="canonical">` (`:10`), the full `og:*` block (`:13-22`) and `twitter:*` card (`:24-28`). All 05-14 landing-shell P0s done. ✅
- **JSON-LD** — `index.html:32-69` ships an `@graph` with `Organization`, `WebSite`, `SoftwareApplication`. `FAQPage` JSON-LD also landed early at `LandingPage.tsx:456-469`. ✅
- **`compression()`** — wired at `packages/backend/src/index.ts:73`, after Helmet. P1 done. ✅
- **The #1 P0 — server-rendered OG for invite links** — DONE, via `GET /invite/:token` (`invite.routes.ts:118-198`): User-Agent-agnostic, returns OG-rich HTML with a dynamic OG image (`/api/og/invite/:token.png`, `og.routes.ts:102-152`), meta-refresh to the SPA for humans. ✅

**Still open / new issues**

1. **P1 — OG base-URL drift behind the proxy.** `invite.routes.ts:154` builds `baseUrl` from `req.protocol + req.get('host')`. **Verified in-session: no `app.set('trust proxy')` anywhere in `packages/backend/src`** (the only hit is a comment in `admin-audit-log.ts:62`). Behind Traefik, `req.protocol` will report `http`, so invite OG image URLs can render as `http://…`. `share.routes.ts:57` does this correctly via `env.API_URL` — the invite route should mirror it.
2. **P2 — `sitemap.xml` / `robots.txt` / route drift.** `robots.txt:7` allows `/invite/` but the sitemap lists only `/` (acceptable — invite tokens are expiring, not worth listing). However `/contact` is a real public SPA route (`App.tsx:137,164`) and appears in *neither* the sitemap nor the robots `Allow` list.
3. **P2 — JSON-LD polish.** `Organization.logo` (`index.html`) points at the 1200×630 `og-image.png`; the brand card wants a square logo. `SoftwareApplication` has no `@id` and no `aggregateRating`.
4. **P2 — render-blocking Google Fonts** at `index.html:71-73` — Sofia's item, but it's a confirmed technical-SEO/LCP cost.

**Verdict:** Sprint 1 closed. Residual technical-SEO risk is the proxy-derived base URL — one P1.

---

### 2.2 Sofia Martínez — Performance & Core Web Vitals

> "The bundle work I scoped for Sprint 2 *and* the `manualChunks` I'd parked in Sprint 3 both shipped. Good. The one item that didn't move is the one with my name hard-attached to it — fonts."

**Shipped since 05-14**

- **Route-level code splitting** — `App.tsx:21-31` lazy-loads all 11 heavy routes; `LandingPage`/`NotFoundPage` stay eager (correct — Landing is the LCP target); `<Suspense>` + `RouteFallback` wrap every route tree; `DialogTestPage` is DEV-gated out of prod. ✅
- **Vendor `manualChunks`** — `vite.config.ts:141-154` isolates `react`, `router`, `motion`, `radix`, `socket`, `i18n`, `tanstack`. Sprint-3 item, shipped early. ✅
- **`connectSocket()` deferred** — `socket.ts:51` sets `autoConnect: false`; connect fires only inside the authenticated `if (user)` effect (`App.tsx:67-68`), not at boot. ✅
- **`<img>` dimensions** — mostly done: `JoinPage`, `ProfilePage`, `UserProfilePage`, `VotePage` result/game images now carry explicit `width`/`height` + `loading`/`decoding`. ✅
- **Bundle hardening** — `vite.config.ts:138` `sourcemap: 'hidden'`; PWA workbox caches Steam media 14d / avatars 7d. ✅

**Still open / new issues**

1. **P1 — Self-host fonts.** `index.html:71-73` still loads Google Fonts as a render-blocking third-party CDN stylesheet — **8 weights** across two families (Bricolage Grotesque ×3, Plus Jakarta Sans ×5). `&display=swap` avoids FOIT but the request stays on the critical path. The 05-14 backlog explicitly wanted self-hosting; it is the **only fully-open Sprint-2 perf item**.
2. **P1 — Radix `AvatarImage` has no intrinsic dimensions.** `avatar.tsx:25-32` sizes the image purely via CSS classes; CLS is contained *only* because every current caller sets a fixed-size class. Flagged on 05-14, still unaddressed — a latent shift for any future caller.
3. **P2 — `<img>` sweep stragglers.** Four bare `<img>`s missed the dimension pass: `ComparePage.tsx:206`, `group-panel.tsx:149`, `game-thumb.tsx:35`, `VotePage.tsx:797` (all sized by CSS class only).
4. **P2 — `framer-motion` on the LCP path.** `LandingPage.tsx:12` imports `motion` directly; because Landing is eager, the `motion` chunk loads on the unauthenticated first paint. Code-splitting helped every other route but not this one.

**Verdict:** 4 of 5 Sprint-2 perf items shipped plus a Sprint-3 bonus. Self-hosted fonts is the open P1.

---

### 2.3 Léa Dubois — Content, Semantics & i18n

> "Both my 05-14 P0s — French title/description, and the `JoinPage` `<main>` landmark — are done, and the landmark structure across the public pages is genuinely clean now. The new issues are smaller, but `en.json` is a trap I want closed before it bites someone."

**Shipped since 05-14**

- **French title** — `index.html:74`, keyword-rich. ✅ (length is a new nit, below)
- **French description** — `index.html:9`, 161 chars, keyword-dense. ✅
- **`JoinPage` `<main id="main-content">`** — all three render branches (`JoinPage.tsx:95,276,285`) now use `<main>`. The 05-14 "missing landmark" flag is fixed. ✅
- **Icon-only button a11y** — the `JoinPage` copy button (`:236-252`) now has a visible text label with the icon `aria-hidden`. The old `title`-only paste button is gone. ✅
- **`FAQPage` JSON-LD** — `LandingPage.tsx:456-469`, 5 FR Q&A pairs. ✅
- **Landmark structure** — verified clean on LandingPage, GroupsPage, VotePage, NotFoundPage, ContactPage: one `<h1>` per render path, `<main id="main-content">` everywhere. ✅

**Still open / new issues**

1. **P1 — `<title>` is 64 chars** (`index.html:74`) — over the ~60-char ideal; Google will truncate the brand-suffix segment. Trim to e.g. `Que jouons-nous ce soir ? | Vote de jeu Steam en groupe`.
2. **P1 — `en.json` is dead, drifting code.** `i18n/index.ts` loads `fr.json` only (684 keys); `en.json` (524 keys) is never imported and is already 160 keys behind. French-only is a deliberate product decision (no language switcher, no `hreflang` needed) — so `en.json` should be **deleted**, not maintained.
3. **P1 — `useDocumentTitle` still updates `document.title` only** (`useDocumentTitle.ts:10-19`) — never `og:title`/`twitter:title`. 14 pages call it. For CSR this barely matters (crawlers don't run the JS); the real answer remains server-rendered OG for any route worth unfurling.
4. **P2 — `VotePage` renders multiple `<h1>`s across branches** (`VotePage.tsx:319,398,423,676,816`). Only one mounts at a time, so not a live bug — but fragile.
5. **P2 — `JoinPage` preview sections use plain `<p>`** (`:113,157,168`) instead of `<h2>`; `og-image.png` is 220 KB (heavy for an unfurl asset).

**Verdict:** Both 05-14 content P0s done; landmark hygiene is now a strength. Remainder is P1 cleanup.

---

### 2.4 David Okafor — Growth & Acquisition

> "My #1 bet shipped and it's well-built — server-rendered invite HTML, a real satori-generated OG image with the group name and game thumbs, graceful fallback for dead tokens. Bet #3 shipped too: the FAQ section is real French prose. Bet #2 — the top.gg listing — nobody touched. It's free and the audience already lives there. That's the open dollar."

**Shipped since 05-14**

- **Bet #1 — invite-link unfurls** — DONE as `GET /invite/:token` (`invite.routes.ts:118-198`), not the proposed `/share/join/:token` name, but functionally identical: server-rendered OG/Twitter HTML, dynamic 1200×630 OG image via satori+resvg (`og.routes.ts:102-152`, `og-image-generator.ts:537-571`) with group name + member count + up to 3 game thumbs, static fallback for expired/invalid tokens. **Verified in-session:** the in-app share component (`invite-link.tsx:31`) emits `/invite/` URLs — so the OG-rich alias *is* what users actually paste. ✅
- **Bet #3 — French landing prose + `FAQPage`** — `LandingPage.tsx:456-469` + ~466 words of `landing.*` copy in `fr.json`. ✅ (thin — see below)
- **`/share/vote/:sessionId` gold standard** — still intact (`share.routes.ts:14-109`). ✅

**Still open / new issues**

1. **P0 (growth) — Bet #2, top.gg listing, untouched.** `packages/discord` is a full 8-command bot (v0.87.0) with zero botlist/top.gg references. Free discovery surface, audience-aligned — the single highest unrealized growth lever now that unfurls are done.
2. **P1 — `og:image:width`/`height` missing on the invite HTML** (`invite.routes.ts:174`) — declared for `/share/vote` (`share.routes.ts:80-81`) but not here. Some crawlers downgrade to a small card without explicit dimensions. Easy parity fix.
3. **P1 — public `/groups/:id/preview` page still doesn't exist.** Until it does, the sitemap has exactly one URL and classic SERP SEO has almost no surface. Needs the product/privacy decision from 05-14.
4. **P2 — OG fonts fetched from GitHub raw at runtime** (`og-image-generator.ts:8-11`) — a GitHub outage degrades every generated card to the no-font fallback. Bundle the TTFs with the backend.
5. **P2 — Landing prose is thin.** The 466 words are mostly UI micro-copy; the FAQ answers carry the real ranking content. Acceptable, marginal for "que jouer ce soir".

**Verdict:** Bets #1 and #3 done and solid. Bet #2 is the open growth item.

---

## 3. Cross-persona consensus

Status of the **05-14 cross-persona table**:

| # | 05-14 issue | Status |
|---|------|--------|
| 1 | `/join/:token` had no server-rendered OG/Twitter meta | ✅ Done (via `/invite/:token`; share UI emits `/invite/`) |
| 2 | Landing title/description weak, mismatched language, no `og:*` | ✅ Done |
| 3 | No `compression()` middleware | ✅ Done (`index.ts:73`) |
| 4 | Auth wall limits SEO ceiling — need a public preview surface | ⚠️ Open — `/groups/:id/preview` not built |
| 5 | No `robots.txt` / `sitemap.xml` | ✅ Done |
| 6 | No route-level code splitting | ✅ Done (`App.tsx:21-31`) |
| 7 | Inconsistent `<img>` width/height → CLS | ⚠️ ~90% — 4 stragglers + Radix Avatar wrapper |
| 8 | No JSON-LD anywhere | ✅ Done (+ `FAQPage`) |

**New issues flagged by two or more personas (2026-05-18):**

| # | Issue | Flagged by | Severity |
|---|------|-----------|----------|
| A | **Render-blocking Google Fonts, 8 weights — not self-hosted** | Marcus, Sofia | P1 |
| B | **Invite OG base URL derived from `req.protocol`; no `trust proxy` set** | Marcus, David (adjacent) | P1 |
| C | **`og:image:width`/`height` missing on invite HTML (parity with vote-share)** | Marcus, David | P2 |
| D | **No public indexable page → sitemap is a single URL** | Marcus, David | P1 |

---

## 4. Prioritized backlog (agreed)

### Sprint 4 — "Close the rushed corners" (3–5 days)

- [ ] **Fix the invite OG base URL.** Either `app.set('trust proxy', 1)` in `packages/backend/src/index.ts`, or switch `invite.routes.ts:154` to `env.API_URL` like `share.routes.ts:57` does. *(Marcus — backend)*
- [ ] **Add `og:image:width`/`height`** to the invite preview HTML (`invite.routes.ts:174`). *(David, Marcus)*
- [ ] **Self-host the fonts.** Audit actual weight usage (8 is likely 2–3 too many), serve `.woff2` locally with `font-display: swap`, `<link rel="preload">` the above-the-fold weights, drop the `googleapis.com` stylesheet. *(Sofia)*
- [ ] **Trim `<title>` to ≤60 chars.** *(Léa)*
- [ ] **Delete `packages/frontend/src/i18n/locales/en.json`** — dead, drifting, French-only is intentional. *(Léa)*
- [ ] **Finish the `<img>` sweep** — add `width`/`height` to `ComparePage.tsx:206`, `group-panel.tsx:149`, `game-thumb.tsx:35`, `VotePage.tsx:797`, and give the Radix `AvatarImage` intrinsic dimensions. *(Sofia)*

### Sprint 5 — "Open a discovery surface" (1–2 weeks)

- [ ] **List the Discord bot on top.gg** (and the Discord App Directory). Free, audience-aligned, no engineering blockers. *(David)*
- [ ] **Decide and — if approved — ship the public `/groups/:id/preview` page** (member count + top games, no PII). Unblocks a real sitemap. *(product decision, then backend + frontend)*
- [ ] **Bundle the OG-generator fonts** locally (`og-image-generator.ts:8-11`) so card rendering doesn't depend on GitHub raw uptime. *(David, backend)*
- [ ] **Add `/contact`** to `sitemap.xml` and the `robots.txt` `Allow` list. *(Marcus)*

### Sprint 6 — "Polish for the organic floor" (conditional)

- [ ] **JSON-LD polish** — square `Organization.logo`, `@id` on `SoftwareApplication`; add `Game`/`Event` schema to the server-rendered share/invite pages. *(Marcus)*
- [ ] **Move `framer-motion` off the LandingPage LCP path** — CSS / `tw-animate-css` entrance animations, or accept the cost. *(Sofia)*
- [ ] **Thicken landing prose** beyond UI micro-copy for "que jouer ce soir". *(Léa, David)*
- [ ] **`<h2>` landmarks** on `JoinPage` preview sections; compress `og-image.png` (220 KB). *(Léa)*

---

## 5. Open questions for product / leadership

1. **`trust proxy`** — confirm the Traefik setup so the Sprint-4 fix picks the right approach (`trust proxy` vs `env.API_URL`).
2. **Public `/groups/:id/preview`** — still unanswered from 05-14. Léa, Marcus and David all need the decision; it gates the only real classic-SEO surface.
3. **`/u/:userId` profiles** — public-indexable or not? (Carried over from 05-14, still open.)
4. **top.gg listing ownership** — who owns the bot's store presence (assets, description, category)?

---

## 6. Status scorecard

| 05-14 Sprint | Items | Shipped |
|--------------|-------|---------|
| Sprint 1 — "Make every shared link sell itself" | 5 | **5 / 5** ✅ |
| Sprint 2 — "Trim the landing bundle" | 5 | 4 / 5 (fonts open) |
| Sprint 3 — "Earn an organic floor" | 5 | 2 / 5 (`manualChunks`, `FAQPage` shipped early) |

**90-day metrics (unchanged from 05-14, now measurable):**

- Invite-to-signup conversion from Discord/Slack/iMessage shares — *unfurls now live, start tracking.*
- Lighthouse mobile: LCP < 2.5s, INP < 200ms, CLS < 0.1 on landing — *re-run after Sprint 4 (fonts + `<img>` sweep).*
- Indexed-page count in Search Console — *flat until `/groups/:id/preview` ships.*
- Brand-query CTR on "que jouer ce soir" — *modest expectation, revisit after Sprint 6.*

---

*Meeting adjourned. Next review after Sprint 4.*
