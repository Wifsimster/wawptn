# Steam New-Releases Digest — Multi-Persona Feature Meeting — 2026-05-15

**Format:** Cross-functional design session, five personas.
**Scope:** Design a feature that posts the week's newest co-op / multiplayer
Steam releases into a group's linked Discord, every Friday at 21:00, with the
schedule configurable by the group owner.
**Attendees:**

- **Camille Roussel** — Senior Product Manager
- **Tom** — Senior Backend Engineer
- **Priya Nair** — Steam Platform / Data Integration Engineer
- **Marco Vidal** — Discord Integrations Engineer
- **Sofia Martínez** — Frontend Engineer

---

## 1. Framing

The request: *"Every Friday evening at 21:00 (configurable by the group owner),
post the week's latest Steam releases — co-op and multiplayer games — into the
Discord channel linked to the group."*

WAWPTN already has two recurring-automation precedents to anchor against: the
per-group **auto-vote scheduler** (`auto-vote-scheduler.ts`, premium) and the
bot's **Friday persona reminder** (`packages/discord/src/scheduler.ts`). The
question for the room was less "can we" and more "where does it live, what does
it cost, and what does it post."

---

## 2. Persona reports

### 2.1 Camille Roussel — Product

- **Premium, opt-in.** The feature trips both prongs of the premium line
  (arbitration #143): real recurring runtime cost (a weekly Steam Store fetch)
  *and* it is a scheduled automation — structurally the same as `auto-vote`,
  which is already premium. It is **not** part of the free "Salon = Groupe"
  promise (C4). Gate it; default it **disabled** on a freshly-linked group —
  silent auto-posting into someone's Discord without consent is a trust
  violation.
- **Minimum lovable v1:** one weekly post, top **5** newest co-op/multiplayer
  releases of the last 7 days, one embed, store links. **Cut:** announcement
  multi-webhook fan-out, per-user DMs, wishlist intelligence, configurable game
  count, missed-week backfill.
- **Three config knobs, nothing more:** enable/disable, schedule, and a co-op /
  co-op+multiplayer filter.
- **Naming (FR):** « Nouveautés Steam de la semaine ».
- **Edge cases:** empty week → post nothing (no "rien cette semaine" spam);
  exclude NSFW titles; re-check premium at fire time (owner may have
  downgraded); guard against duplicate posts.

### 2.2 Tom — Backend

- **Backend owns the scheduler**, not the bot. The backend owns the Steam Store
  client (rate limiter + circuit breaker) and the DB; the bot is a dumb
  transport. Mirror `auto-vote-scheduler.ts`: a per-group cron task map with a
  5-minute re-sync.
- **Schema:** columns on `groups` (per-group config, exactly like
  `auto_vote_schedule`), not a side table.
- **Idempotency is the whole ballgame.** In-process cron tasks die on restart.
  The real double-post risks — a sync-triggered re-register, two backend
  instances — are killed by an **ISO-week guard column** claimed via an *atomic
  conditional UPDATE*: `WHERE last_iso_week IS DISTINCT FROM thisWeek`. The
  worker that flips the row posts; the loser is a no-op.
- **Transport:** reuse the *pattern* of `notifier.ts` (bot-backed primary,
  webhook fallback) in a new `releases-notifier.ts`. Bot-linked groups need a
  small, **generic** bot endpoint — `POST /internal/channel/post` — that posts
  a plain embed; not digest-specific, so it earns its keep.
- **Failure modes:** circuit open → abort, retry the next group; no Discord →
  skip; empty list → claim the week, post nothing.

### 2.3 Priya Nair — Steam data

- Steam has **no clean date-filtered "new releases" Web API**. `featuredcategories`
  is curated "new & trending", not last-7-days — usable only as a fallback.
- **Recommended source:** the storefront search JSON
  (`/search/results/?json=1`), `sort_by=Released_DESC`, pre-filtered server-side
  to `category2=1,9,38` (multiplayer / co-op / online co-op). The response
  embeds an HTML fragment — scrape **only** the `data-ds-appid` attribute, the
  single most stable thing in it.
- **Confirm every candidate** through `appdetails` (reuse the existing Store
  client's rate limiter + circuit breaker). Request **`cc=us&l=english`** so
  `release_date.date` is a parseable `D Month, YYYY` string; reject anything
  vaguer.
- **Junk filter:** `comingSoon`, `type !== 'game'`, adult content descriptors.
- **Cost & caching:** the new-releases list is global — compute **once per ISO
  week** and share an in-memory cache across all groups (per CLAUDE.md: no
  Redis for MVP). Never publish a digest assembled while the circuit was open.

### 2.4 Marco Vidal — Discord

- Preferred bot-owned cron, but conceded the decisive split (see §3): the
  digest schedule is **per-group**, the bot's reminder cron is **per-guild** —
  putting the digest on the bot would force per-group resolution the bot
  doesn't do, and webhook-only groups would need a backend path *anyway*.
- **Embed:** one rich embed, games as fields (Discord limits: 25 fields, 6000
  chars). One hero image (the week's top release). French copy.
- **Collision flag:** the digest at the default 21:00 lands alongside the bot's
  existing 21:00 persona reminder. Noted as a known, owner-adjustable overlap —
  not a blocker.
- **Failure handling:** wrap each channel post per-group; a deleted channel or
  a missing-permissions error must never block other groups.

### 2.5 Sofia Martínez — Frontend

- Config UI belongs in `GroupSidebar`, directly under the auto-vote button —
  all owner scheduling controls grouped, owner-only.
- The entry point must be **visible but disabled** when the group has no linked
  Discord channel: a hidden control is undiscoverable; a disabled one teaches
  the prerequisite.
- Premium-gate it exactly like auto-vote (lock icon + `featureLocked` badge →
  `/subscription`).
- Minimal controls: schedule + a co-op filter toggle. API and store mirror the
  `autoVoteSchedule` pattern.

---

## 3. The architectural debate — cron ownership

The one genuine conflict: **Tom (backend-owned cron)** vs **Marco (bot-owned
cron)**.

- *Backend:* owns the Steam data and the DB; `auto-vote-scheduler.ts` already
  establishes a per-group backend cron; webhook-only groups must be posted by
  the backend regardless.
- *Bot:* already runs a Friday cron and iterates linked channels.

**Resolution (chair decision): backend-owned.** Splitting the feature across
two processes is worse than the bot's pre-existing cron is good. The digest
schedule is per-*group* while the bot's cron is per-*guild*; the backend
already does per-group scheduling; and a single process owning compute +
schedule + idempotency is far easier to reason about and test. The bot keeps
exactly one new responsibility: a generic `POST /internal/channel/post`
endpoint so bot-linked (webhook-less) groups can still receive the digest.

---

## 4. Cross-persona consensus

| # | Decision | Raised by |
|---|----------|-----------|
| 1 | Premium feature, **disabled by default**, opt-in | Camille, Sofia |
| 2 | Backend-owned per-group cron, mirror `auto-vote-scheduler.ts` | Tom |
| 3 | **ISO-week column** + atomic conditional UPDATE = idempotency guard | Tom |
| 4 | Storefront search → confirm via `appdetails` (`cc=us&l=english`) | Priya |
| 5 | **Shared in-memory weekly cache** — compute once, not per group | Priya |
| 6 | Dual transport: bot-backed primary, webhook fallback | Tom, Marco |
| 7 | Exclude NSFW, coming-soon, non-game types | Camille, Priya |
| 8 | Re-check owner premium at fire time | Camille |
| 9 | Config in `GroupSidebar`, owner-only, disabled without Discord | Sofia |

---

## 5. Final design (as implemented)

**Schema** — `migrations/20260515_add_releases_digest.ts`, columns on `groups`:
`releases_digest_enabled`, `releases_digest_schedule` (default `0 21 * * 5`),
`releases_digest_coop_only`, `releases_digest_last_iso_week`,
`releases_digest_last_posted_at`.

**Steam data** — `steam-store-client.ts` gains `getNewReleaseCandidateIds()`
(search JSON, `featuredcategories` fallback) and `getStoreAppForDigest()`
(`appdetails`, English locale), both reusing the existing Store rate limiter
and circuit breaker.

**Domain** — `domain/releases-digest.ts`: `getWeeklyReleases()` (shared
in-week cache; not cached when a Steam outage produced nothing) and
`runReleasesDigestForGroup()` (re-validate → compute → atomic ISO-week claim →
post). Pure helpers `currentIsoWeek`, `parseReleaseDate`, `isDigestEligible`
are unit-tested.

**Transport** — `infrastructure/discord/releases-notifier.ts` builds the embed
and posts bot-first / webhook-fallback. `bot-client.postChannelEmbed()` →
new bot endpoint `POST /internal/channel/post` (generic plain-embed post).

**Scheduler** — `infrastructure/scheduler/releases-digest-scheduler.ts`,
per-group cron tasks in `Europe/Paris`, 5-minute re-sync, started from
`index.ts`.

**API** — `PATCH /api/groups/:id/releases-digest`, owner-only +
`requirePremiumFeature('releases-digest')`; digest config added to the group
detail response.

**Frontend** — owner-only config dialog in `GroupSidebar` (schedule via the
existing `CronAutocomplete`, co-op filter toggle), premium-gated, disabled
when the group has no linked Discord channel.

---

## 6. Open questions / future work

1. **21:00 collision** with the bot's persona reminder — accepted for v1
   (owner-adjustable); revisit if channels feel spammy.
2. **Per-group vs per-guild schedule scope** — the digest is per-group, the
   bot reminder per-guild. A future pass could unify them.
3. **Missed-Friday on restart** — a backend down across the scheduled minute
   skips that week (same limitation as `auto-vote-scheduler.ts`). A durable
   catch-up poll was considered and deferred as out of scope.
4. **Announcement multi-webhook fan-out** for the digest — explicitly cut from
   v1; would reuse `group_announcement_webhooks` if revived.

---

*Meeting adjourned.*
