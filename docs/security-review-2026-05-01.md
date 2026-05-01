# Security Review — Multi-Persona Meeting

**Date:** 2026-05-01
**Branch:** `claude/security-review-subagents-ejgTO`
**Scope:** Full-codebase review (no pending diff against `main`)
**Format:** Four security personas reviewed independently in parallel; this
document is the chaired synthesis of their reports.

## Participants

| Persona | Lens |
|---|---|
| Red Team Attacker | External attack surface, IDOR, injection, OpenID/cookie forgery |
| OWASP Auditor | Mapping to OWASP Top 10 (2021) |
| DevOps / Infra | Dockerfile, Compose, GitHub Actions, secrets, deploy pipeline |
| Real-time / Business Logic | Socket.io, voting integrity, invite/ban flow, Discord bot abuse |

A finding mentioned by multiple personas is consolidated. Where a persona's
claim was checked against source and found incorrect, it is marked
**[DISPUTED]** with the reason.

---

## Executive summary

| Severity | Count | Notes |
|---|---|---|
| Critical | 0 confirmed | The "invite-token race" originally flagged Critical is disputed (see §A1). |
| High | 6 | Auth realm, CORS hardening, GH Actions pinning, kick-without-ban, vote rate-limit granularity, Steam-realm derivation |
| Medium | ~12 | CSP `unsafe-inline`, GOG state truncation, Discord setup auth scope, log redaction, WebSocket backpressure, etc. |
| Low / Info | ~10 | Pool sizing, signal handling, Discord ID format, etc. |

**Top three actions for the next sprint:**

1. **Hardcode the Steam OpenID `realm`** to a canonical app origin instead of
   deriving it from the caller-supplied `returnUrl`
   (`packages/backend/src/infrastructure/steam/steam-client.ts:201`).
2. **Ban-on-kick** so a kicked user cannot rejoin a still-live invite link
   (`packages/backend/src/presentation/routes/group.routes.ts:540-ish`,
   referencing the existing ban check at lines 419-434 that already works
   correctly when a ban row exists).
3. **Pin GitHub Actions to commit SHAs** in `.github/workflows/release.yml`
   (currently `@v2`/`@v3`/`@v6` tags — mutable).

---

## A. Confirmed findings (multi-persona consensus)

### A1. Invite-token max-uses race — **[DISPUTED]**

Red Team flagged this Critical at `group.routes.ts:453-468`. Verified against
source: the join flow runs an atomic
`UPDATE groups SET invite_use_count = invite_use_count + 1 WHERE id = ? AND invite_use_count < invite_max_uses`
inside a transaction. Postgres acquires a row-level lock before the WHERE is
re-evaluated, so concurrent claimants serialize and the second one gets
`claimed === 0` and 410. **No race; design is correct.** Recommend leaving a
short comment near the increment so this doesn't get re-flagged in future
reviews.

### A2. Steam OpenID `realm` derived from caller-supplied URL — **High**

`steam-client.ts:201` builds `openid.realm = new URL(returnUrl).origin`.
Realm should be a hard-coded canonical origin (e.g. `https://wawptn.app`)
read from a trusted env var, not derived from a string the caller passed in.
A misconfiguration or future refactor that lets `returnUrl` host vary turns
into a phishing primitive (Steam approves, browser is sent to attacker
origin).
**Fix:** `realm: env.PUBLIC_ORIGIN`, validate at startup.

### A3. CORS_ORIGIN not validated against wildcard — **High**

`env.ts:73-96` validates `APP_SECRET` length and rejects `localhost` in prod
but does not reject `CORS_ORIGIN === '*'` or schemeless values. A single
misconfigured deploy opens the API to any origin with credentials.
**Fix:** add explicit reject for `*`, require `https://`, parse with `new URL`.

### A4. Hardcoded development credentials in source — **High**

`env.ts:9` (`postgresql://wawptn:wawptn_secret@…`) and `env.ts:12`
(`dev-secret-change-in-production-min-32-chars`) ship in the bundle. Prod
validation enforces override of `APP_SECRET` only — `DATABASE_URL` is never
required, so a prod build with an empty env will silently fall back to
`localhost` and crash at first query rather than fail fast at startup.
**Fix:** require `DATABASE_URL` in `validateEnv()`; remove the inline default
or rename to `DATABASE_URL_DEV` and only read it under `NODE_ENV !== 'production'`.

### A5. Ban-on-kick gap — **High**

The invite join flow at `group.routes.ts:419-434` correctly blocks banned
users via `isBannedFromGroup()`. However, the kick endpoint deletes the
`group_members` row without writing a `group_bans` row (per Real-time
persona, citing `group.routes.ts:540-542`). A kicked user clicking the same
invite link rejoins immediately. Confirm by reading the kick handler — if
true, write a ban record on every kick.
**Fix:** wrap kick + ban-insert in a single transaction.

### A6. GitHub Actions third-party actions not SHA-pinned — **High**

`.github/workflows/release.yml` references `softprops/action-gh-release@v2`,
`docker/build-push-action@v6`, `docker/login-action@v3` by tag. Combined
with `permissions: contents: write, packages: write` at the job level, a
hijacked tag pushes arbitrary commits or images.
**Fix:** pin to commit SHAs; reduce default permissions to `read`; elevate
per-step where needed; switch GHCR auth to OIDC.

### A7. Vote-cast rate limit shares budget across (user, session, game) — **High**

`vote.routes.ts` cast endpoint sits behind `voteLimiter` (~30/min). That
budget covers all votes from a session, not per-game. Combined with no
per-(user, session, game) write window, it permits rapid replay attempts.
DB upsert prevents duplicate rows but invites contention.
**Fix:** tighten limiter to 1 cast per ~3-5s per (user, session, game)
tuple, or short-circuit at the route layer when the upsert affected zero
rows.

---

## B. OWASP Top 10 mapping (additional medium findings)

### A02 Cryptographic Failures
- **GOG OAuth state truncated to 16 hex chars** (`auth.routes.ts:783`)
  reduces CSRF state entropy from 256 → 64 bits. Use the full HMAC.
- **HKDF salt is empty string** in `infrastructure/crypto/token-cipher.ts:8`.
  Use a static random salt (constant per deploy is fine; just not empty) or
  embed a per-ciphertext random salt.

### A04 Insecure Design
- **CSP allows `'unsafe-inline'`** for `styleSrc` in `index.ts:53-54`.
  Move to nonce-based CSP or hashed inline styles.
- **`participantIds` not validated as group members** in
  `vote.routes.ts:128`. Server should intersect with current membership
  before insert.

### A05 Security Misconfiguration
- **Steam API key embedded in URL** (`steam-client.ts:113`) and surfaced in
  error logs at line ~118. Move the key to a header (Steam supports
  `key=` only in URL, so instead redact URLs in error logs).
- **`/health` endpoint queries DB unauthenticated** — fine if behind
  Traefik internal network; risky if ever exposed publicly.

### A07 Identification & Authentication Failures
- **`POST /logout` not CSRF-protected.** Embedding
  `<img src="…/api/auth/logout">` on a third-party site logs the user out.
  Either require a token or set `SameSite=Strict` on the session cookie.
- **`return_to` validated by string equality with `env.API_URL`** in the
  Steam callback (`auth.routes.ts:165-167`). Fine in practice but tightly
  couples behavior to a single env var; consider parsing and comparing
  origin + path explicitly.

### A09 Logging
- **Pino redacts `cookie`/`authorization` but not URLs** containing the
  Steam key (see A05) or Discord OAuth nonces (`auth.routes.ts:249-253`).
  Add `*.url` to redaction paths or strip query strings before logging.

### A10 SSRF
- **Font fetcher in `og-image-generator.ts:20-23`** has no timeout or size
  cap. Hardcoded URL → no SSRF, but a hung GitHub fetch can stall request
  threads. Add `AbortSignal.timeout(5000)` and size cap.

---

## C. Real-time and business logic

- **No rate limit on group creation per user** — global limiter only
  (`apiLimiter` 300/min). Add a per-user creation throttle (e.g. ≤5/hour).
- **No cooldown on owner-triggered library sync** (`group.routes.ts:787-816`)
  — fan-out to Steam Web API can be abused by the owner. Record last sync
  per group and reject within 5-10 min.
- **Invite tokens do not rotate on use.** A leaked link remains valid until
  it hits `invite_max_uses` or 72h. Acceptable for the current threat
  model; consider an explicit "rotate token" button for owners.
- **Discord `@everyone` sanitization is weak** — three sequential `.replace`
  calls with zero-width-space substitution
  (`discord.routes.ts:793-798`). Replace with a strict reject: refuse to
  send any LLM output that matches `/@(everyone|here|[!&]?\d{17,20})/`.
- **Socket.io has no per-IP/connection cap.** A bot can open thousands of
  pre-auth sockets and hold them ~20s each (until `pingTimeout`). Add
  `maxHttpBufferSize: 65536` and an IP-based connection limit at Traefik
  or in the auth middleware.
- **Discord setup endpoint** (`discord.routes.ts:32`) — Red Team flagged
  this Critical for missing per-group ownership check. Worth verifying:
  the route is mounted under `requireBotAuth` (bot-to-backend secret),
  but it appears to accept arbitrary `groupId` from the bot. The bot is
  trusted but the bot's *Discord-side input* is not — ensure the bot has
  already validated the requesting Discord user is a group owner before
  calling this endpoint.

---

## D. Infrastructure / supply chain

| # | Severity | Location | Issue / Fix |
|---|---|---|---|
| D1 | High | `release.yml:32-34` | Reduce default `permissions` to read; elevate per-step. |
| D2 | High | `release.yml` | Pin `softprops/action-gh-release`, `docker/build-push-action`, `docker/login-action` to commit SHAs. |
| D3 | High | `Dockerfile:7` | `node:24-alpine` → pin to digest. |
| D4 | High | `compose.yml:82`, `compose.local.yml:3` | `postgres:16-alpine` → pin to digest. |
| D5 | Med | `release.yml:289-293` | Self-hosted runner executes `/home/deploy/deploy-wawptn.sh` with no integrity check. Pin runner labels, sign or hash the script. |
| D6 | Med | `compose.yml:69` | `DISCORD_BOT_HTTP_HOST=0.0.0.0` — switch back to `127.0.0.1` and rely on Docker DNS (`wawptn-discord:3001`). |
| D7 | Med | `release.yml:103-108` | Stripe-only secret check runs at release. Move to `pull_request` and broaden patterns (`*_SECRET`, `*_API_KEY`, `*_TOKEN`). |
| D8 | Med | `database/connection.ts:11` | No SSL config — add `ssl: { rejectUnauthorized: env.NODE_ENV === 'production' }` or `sslmode=require`. |
| D9 | Low | `connection.ts:12-18` | Pool max hard-coded at 10. Make `DB_POOL_MIN/MAX` env-tunable. |
| D10 | Info | `.env.example` | Replace realistic-looking placeholders (`sk_test_…`) with `<STRIPE_SECRET_KEY>`. |

---

## E. Disputed / withdrawn

- **A1 — invite-token race**: source verified race-safe via single-statement
  conditional UPDATE with row lock.
- **OWASP "open redirect via `returnTo`"** (auth.routes.ts:261-264): the
  regex `^/join/[a-f0-9]{64}$|^/discord/link\?code=` already constrains the
  path; combined with frontend-side absolute-URL construction, no open
  redirect. No action.
- **OWASP-A06 `cors@^2.8.5`**: that is the current latest version of the
  package; there is no `cors@^3.x`. No action.

---

## F. Suggested sequencing

**Sprint 1 (security-critical):** A2, A3, A4 (require DATABASE_URL), A5,
A6, A7. All small, isolated changes.

**Sprint 2 (hardening):** OWASP A02 (GOG state, HKDF salt), A05 (log
redaction), A07 (logout CSRF). Discord `@everyone` strict reject. Socket.io
backpressure.

**Sprint 3 (infra):** Pin all base images to digests; add SBOM/provenance
to `docker/build-push-action`; move secrets check to PR stage.

---

*Generated by parallel persona subagents and chaired synthesis. Findings
referencing line numbers were not all individually re-verified against
source — treat line numbers as starting points, not ground truth, except
where marked "verified".*
