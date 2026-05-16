# Production Launch Readiness — Multi-Persona Meeting

**Date:** 2026-05-16
**Branch:** `claude/review-subagents-personas-7pRzd`
**Scope:** Full-codebase review against the question *"what is missing before we
launch to production?"* — no pending diff against `main`.
**Format:** Six personas reviewed the codebase independently in parallel; this
document is the chaired synthesis of their reports. Findings raised by multiple
personas are consolidated. Claims checked against source and found overstated
are marked **[DISPUTED]** with the reason.

## Participants

| Persona | Lens |
|---|---|
| **Julien Mercier** — DevOps / SRE | Deploy pipeline, Docker, observability, backups, rollback |
| **Tom** — Senior Backend Engineer | Error handling, migrations, schedulers, data integrity |
| **Nadia Brunet** — Application Security | Re-verify 2026-05-01 findings + new attack surface |
| **Sofia Martínez** — Frontend Engineer | UX robustness, i18n, PWA, error states |
| **Camille Roussel** — Senior Product Manager | Legal / GDPR / billing compliance, funnel |
| **Hugo Lefèvre** — QA / Test Engineer | Test coverage, CI gating, release confidence |

---

## Executive summary

**Verdict: NOT ready to launch.** Four of six personas (DevOps, Backend,
Product, QA) returned an explicit "not ready"; Security and Frontend each
returned one launch-blocking finding. The application *feature set* is mature
and several subsystems are genuinely well-built (Stripe webhook idempotency,
advisory-lock leader election, DB-level vote constraints, the PWA update flow).
What is missing is the **operational and legal scaffolding a paid EU consumer
launch requires** — and one class of backend defect (no error handling of last
resort) that turns any unhandled exception into a 5xx hang or a process crash.

| Severity | Count | Theme |
|---|---|---|
| **Blocker** | 8 | Error handling, CI test gating, legal pages, GDPR deletion, backups, observability, billing disclosures, Discord `/setup` IDOR |
| **High** | 9 | Steam realm, ban-on-kick, deploy rollback, graceful shutdown, scheduler catch-up, i18n, untested critical paths, image pinning, support channel |
| **Medium** | ~14 | CORS validation, `DATABASE_URL` requirement, CSP, pool sizing, stale-cache, etc. |
| **Low / Info** | ~10 | Console noise, source maps, `npm audit`, etc. |

**The eight launch blockers, in priority order:** see §1.

---

## 1. Launch blockers (chaired consensus)

### B1. No error handling of last resort — backend

There is **no global Express error handler** (`grep` for `app.use((err`,
`ErrorRequestHandler` → zero hits) and **no `unhandledRejection` /
`uncaughtException` handlers** (`index.ts:351-352` registers only SIGTERM/
SIGINT). Express 5 forwards a rejected async handler to error middleware — but
none exists, so any route lacking its own `try/catch` (e.g. the cast-votes
transaction at `vote.routes.ts`) leaves the request **hanging until timeout** on
a DB error, and any stray rejection in an event-bus subscriber
(`session-effects.ts`) can kill the process with no structured log.
**Fix:** add a terminal `app.use((err, req, res, _next) => …)` after all routes,
plus `process.on('unhandledRejection' | 'uncaughtException', …)` that logs
`fatal` and exits cleanly so the container restarts.

### B2. CI never runs the test suite — release confidence is zero

`.github/workflows/ci.yml` (PR gate) and the `lint` job in `release.yml` run
**only** `lint` + `tsc --noEmit`. The string `test`/`vitest` appears in neither
workflow. The 103 backend Vitest tests and the 3 Playwright e2e specs **gate
nothing** — a merge, and an automatic production deploy, can ship with a fully
red suite. `release.yml`'s `deploy` job (`needs: [release]`) reaches prod after
lint+typecheck only.
**Fix:** add a `test` job to `ci.yml` (mark required in branch protection) and
chain it into the `needs:` graph of `release` so an untested commit cannot
deploy.

### B3. No legal pages — Privacy, Terms, CGV, mentions légales

The footer links only to `/contact`; `App.tsx` routes no policy pages; a
repo-wide search finds no policy content. A French-targeted, EU-hosted, **paid**
app legally requires a Privacy Policy (RGPD Art. 13), CGU/Terms, CGV (mandatory
for B2C sales in France), and mentions légales (publisher + host identity, LCEN).
**Fix:** author all four; add routes + footer links before launch.

### B4. No GDPR data-export / account-deletion — and the FAQ promises one

`fr.json` FAQ entry `faq5A` states *"Vous pouvez supprimer votre compte à tout
moment"*, but no delete/erasure or export endpoint exists and `App.tsx` has no
`/account` route (the `en.json` "Danger zone" key + `premium-notifications.ts`
reference one — half-built). Claiming a right to erasure you do not honour is
itself a violation.
**Fix:** build self-service account deletion (purge `users`/`user_games`/`votes`
+ `stripe.customers.del`) and a data export before launch.

### B5. No database backup / restore strategy

`compose.yml` runs Postgres on a single named volume with no `pg_dump` cron, no
PITR, no off-host copy. A bad migration or a lost volume is unrecoverable.
**Fix:** add an off-host `pg_dump` schedule and **test the restore** before
launch.

### B6. No observability — a 2am failure is invisible

No error tracking (Sentry or equivalent), no metrics endpoint, no alerting. Logs
are pino JSON to stdout only. A crash loop, a failed migration, or a downed
Discord bot pages nobody.
**Fix:** wire error tracking into backend + bot, ship logs to a queryable store,
add uptime + healthcheck-failure alerting before taking paying customers.

### B7. No consumer-billing disclosures (refund / 14-day withdrawal / VAT)

`SubscriptionPage.tsx` shows a price and a checkout button — no terms, no refund
policy, no EU 14-day right-of-withdrawal notice (and no explicit
immediate-performance consent that waives it for a digital subscription).
`STRIPE_AUTOMATIC_TAX_ENABLED` gates Stripe Tax and is **not verified as
onboarded** — selling B2C in the EU without VAT collection is a tax breach.
**Fix:** add billing terms + withdrawal disclosure at checkout; confirm Stripe
Tax is live before charging a euro.

### B8. Discord `/setup` IDOR — arbitrary group hijack

`discord.routes.ts:32-69` binds any `discordChannelId`/`guildId` to any
`groupId` with only an existence check. Anyone with the bot secret — or a buggy
bot — can redirect a victim group's notifications to an attacker-controlled
channel.
**Fix:** verify the calling Discord user owns the target group
(`discord_links` → `group_members.role = 'owner'`) before the `UPDATE`.

---

## 2. Persona reports (condensed)

### 2.1 Julien Mercier — DevOps / SRE

Beyond B5/B6: the deploy is a **non-atomic in-place restart with no rollback** —
`deploy/deploy.sh` does `pull` + `up -d` (brief downtime) then
`docker image prune -f`; if `compose.yml` tracks a moving tag the previous image
becomes dangling and is pruned, leaving no rollback target. **Graceful shutdown
is incomplete** — `index.ts:339-349` does not `await httpServer.close()`, never
calls `io.close()`, and stops only the subscription reconciler while the four
cron schedulers keep firing. The **Discord bot sidecar has no SIGTERM handler**
at all. Known infra findings from 2026-05-01 are still open: base images and GH
Actions unpinned (`Dockerfile:7`, `compose.yml`, `release.yml`), no DB SSL
(`connection.ts`), `DISCORD_BOT_HTTP_HOST=0.0.0.0`. No container resource
limits. Single-instance assumptions (in-process cron, in-memory rate limiter and
caches) are real but **undocumented** — running two replicas would double-fire.

### 2.2 Tom — Backend

B1 is the headline. Otherwise the backend is **solid**: webhook idempotency,
advisory-lock leader election in the reconciler, the partial unique index
backing one-open-session-per-group, and `IF NOT EXISTS` constraint migrations
are all correct. Remaining concerns: in-process node-cron jobs **silently skip**
on a restart spanning their fire time — the daily 03:00 Stripe reconcile and a
group's weekly digest are not catch-up-aware (the 15s vote auto-close poll *is*
durable). Steam client rate-limiter is process-global mutable state with no
`fetch` timeout — a group sync can burst and a hung connection blocks
indefinitely. `DB_POOL_MAX=10` is low for the combined request + scheduler
load. Two migration files share the `20260414_b_` prefix — currently ordered
deterministically and harmless, but the `a/b/c/h/z` suffix convention is a
latent ordering-bug generator.

### 2.3 Nadia Brunet — Security

No new BLOCKER beyond B8. **Re-verification of the 2026-05-01 findings:**

| ID | Finding | Status |
|----|---------|--------|
| A2 | Steam realm from caller URL | **NOT FIXED** (`steam-client.ts:201`) |
| A3 | CORS not validated vs `*` | **NOT FIXED** (`env.ts:115-117`) |
| A4 | Require `DATABASE_URL` in prod | **PARTIAL** — default still at `env.ts:9`, never required |
| A5 | Ban-on-kick | **NOT FIXED** (`group.routes.ts:634` — kicked user rejoins) |
| A6 | GH Actions SHA pinning | **NOT FIXED** |
| A7 | Vote rate-limit granularity | **NOT FIXED** |
| B-A02 | HKDF empty salt | **FIXED** |
| B-A02 | GOG state truncation | **NOT FIXED** (`auth.routes.ts:783`) |
| D10 | `.env.example` placeholders | **FIXED** |

Verified clean on the *new* surface: Stripe webhook signature handling, admin
routes (`requireAuth + requireAdmin + requireSameOrigin`), `user-profile`
co-membership checks, `bot-auth` timing-safe comparison. The A2 (realm) and A5
(ban-on-kick) carryovers are **High** and should ship with the launch.

### 2.4 Sofia Martínez — Frontend

The frontend is in good shape — top-level error boundary, code splitting, PWA
prompt-to-update, socket-reconnection UX, per-page skeleton/empty/error states
are all properly done, and `DialogTestPage` is correctly `import.meta.env.DEV`-
gated so it never ships to prod. **One blocker:** `en.json` has 524 keys,
`fr.json` has 666 — **142 keys missing from English**. With `fallbackLng: 'fr'`,
an English browser silently renders entire sections (subscription, premium,
compare, streaks, user profile) in French. Since the product UI language is
French by definition (CLAUDE.md), the **clean fix is to go French-only for v1**:
drop the `LanguageDetector`, remove `en` from resources, hard-set `lng: 'fr'`.
Lesser items: `AdminPage.tsx` has ~25 hardcoded French strings bypassing
`t()`; `vite.config.ts` should set `build.sourcemap: 'hidden'` explicitly; the
`api-get` runtime cache can serve 5-min-stale API data after a deploy.

### 2.5 Camille Roussel — Product

B3/B4/B7 are the compliance blockers. Beyond them: **support is Discord-only** —
`ContactPage.tsx` offers no contact email, which is itself a mentions-légales
requirement and inadequate for a paid service with billing questions. The AI
game-recommendation feature sends group library data to an LLM provider with
**zero disclosure** — must appear in the Privacy Policy's processor list (Steam,
Discord, Stripe, Resend, LLM). `/join/:token` invite links still lack
server-rendered OG tags (the highest-ROI item from the 2026-05-14 SEO meeting).
The first-run funnel itself is fine — `GroupsPage` has a proper empty state with
create/join CTAs.

### 2.6 Hugo Lefèvre — QA

B2 is the headline. Coverage inventory: **16 test files, 103 tests, all passing
locally (~1.2s)** — but they import only 7 domain modules. **Critical paths with
no coverage:** Steam OpenID auth, group join + invite-token HTTP layer, Stripe
webhook handlers (`stripe-event-handlers.ts`, 509 lines), vote-casting route,
Socket.io events, admin authorization, the 1398-line `discord.routes.ts`. All
backend tests use a hand-rolled Knex `Proxy` mock — **no integration test ever
touches a real database**, so the common-games intersection SQL and the
DB-level vote/session constraints are unverified. The `packages/discord/`
workspace has **zero tests**. `npm audit` reports 21 vulnerabilities (14 high).

---

## 3. Cross-cutting consensus

| # | Finding | Raised by |
|---|---------|-----------|
| 1 | CI does not run tests; deploy is ungated | Hugo, Julien |
| 2 | GH Actions + base images unpinned | Julien, Nadia |
| 3 | No DB SSL config | Julien, Nadia |
| 4 | No GDPR account deletion (also Stripe review D1) | Camille, Hugo |
| 5 | `DATABASE_URL` not required / default in source | Julien, Nadia |
| 6 | Single-instance assumptions undocumented | Julien, Tom |

---

## 4. Disputed / downgraded

- **"Index migrations lock tables — Blocker"** (Backend) — **[DISPUTED]**.
  The migration in question, `20260412_add_performance_indexes.ts`, is dated
  2026-04-12, uses `CREATE INDEX IF NOT EXISTS` throughout, and on the
  continuously-deployed production DB **has already run**. On a fresh DB the
  indexes build instantly on empty tables. It is not a launch blocker.
  **Downgraded to Medium** as a forward-looking process rule: *future* index
  migrations on populated tables should use `CREATE INDEX CONCURRENTLY` (run
  outside the Knex per-file transaction).
- **Logout CSRF** (carried from 2026-05-01 B-A07) — **PARTIAL / Low**. `POST` +
  `SameSite=Lax` already blocks the realistic vectors; tightening is optional.
- **`/api/events` public ingestion** (Security) — confirmed acceptable for
  launch: covered by the global limiter, strict event-name whitelist, no PII.

---

## 5. Verified-good (no action needed)

So the team knows what is *not* on the punch list: the Stripe webhook path
(raw-body signature verification, atomic event claim, transactional handlers,
idempotency keys), the subscription reconciler's advisory-lock leader election,
DB-level vote-uniqueness and one-open-session-per-group constraints, the
frontend error boundary + PWA prompt-update flow, `DialogTestPage` dev-gating,
the admin route guard chain, `bot-auth` timing-safe comparison, and the
first-run onboarding empty states.

---

## 6. Suggested sequencing

**Pre-launch — must fix (the eight blockers + the two security carryovers):**
B1 global error + process handlers · B2 CI test gate · B3 legal pages · B4 GDPR
deletion/export · B5 DB backup + tested restore · B6 error tracking + alerting ·
B7 billing disclosures + Stripe Tax · B8 Discord `/setup` ownership check · A2
Steam realm · A5 ban-on-kick.

**Launch week — High:** deploy rollback target + zero-downtime · complete
graceful shutdown (await `httpServer.close`, `io.close`, stop crons) · Discord
bot SIGTERM handler · scheduler catch-up for the daily jobs · i18n decision
(French-only v1) · pin images + GH Actions · support email · invite-link OG tags.

**Post-launch — Medium/Low:** CORS `*` validation · require `DATABASE_URL` ·
DB SSL · `DB_POOL_MAX` sizing · Steam client `fetch` timeouts · integration
tests against a real DB · CSP `unsafe-inline` removal · `npm audit` cleanup ·
document single-instance constraint in CLAUDE.md.

---

*Generated by parallel persona subagents and chaired synthesis. Line numbers
referenced from persona reports were spot-checked against source where marked;
treat the rest as starting points. The disputed index-migration finding, the
absence of a global error handler, the i18n key counts (524 EN / 666 FR), and
`deploy/deploy.sh` were verified directly by the chair.*

*Meeting adjourned.*
</content>
</invoke>
