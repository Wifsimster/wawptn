# New Game Spotlight — Design Notes — 2026-06-05

## Request

> "Promote a game people have (or don't have) in common. When I buy a game, show
> it in my group's Discord and ask if people want to play it — run it on a
> workflow."

When a member acquires a new game, WAWPTN announces it into the group's linked
Discord ("**X** vient d'ajouter **Y** ! Qui veut jouer ?"), shows how many group
members already own it (the "have or not in common" angle), and opens an
interactive vote so the group can say yes/no — reusing the existing voting
machinery.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Interactive** "qui veut jouer ?" — reuse the voting session machinery | User choice. Gets Discord buttons, live tally, web votes and the winner reveal for free. |
| 2 | **Free**, owner **opt-in**, **disabled by default** | User choice (free). Auto-posting into someone's Discord without consent is a trust violation (same principle as the releases digest), so it is opt-in. |
| 3 | **Real-time on sync** | User choice. Detection happens inside `syncUserLibrary` (login + manual re-sync), so there is no separate cron — the library sync *is* the "workflow". |
| 4 | Announcement embed **+** interactive vote (two messages) | The announcement carries the "who bought it / who already owns it" context the default vote message can't; the vote stays a plain reuse of `createVotingSession` with **zero** changes to the bot's rendering, vote handling, or live-updater. |

## How "new" is detected

`user_games.synced_at` is rewritten on every sync, so it can't distinguish a
freshly bought game. Instead `syncUserLibrary` snapshots the user's Steam app
IDs **before** the upsert and diffs the freshly returned list against it
(`diffNewlyAcquired`). The **first** sync (empty snapshot) seeds the whole
library and is deliberately skipped, so logging in never floods Discord.

## Idempotency

`group_game_spotlights (group_id, game_id)` is an append-only ledger. Each
spotlight run claims its games with a single
`INSERT ... ON CONFLICT DO NOTHING RETURNING game_id`; only the rows it actually
won are posted. A re-sync, a second member buying the same game, or a second
backend instance therefore can never double-post the same game into a group.

## Flow (`domain/new-game-spotlight.ts`)

1. Sync detects newly acquired games → `processNewGameSpotlights(userId, games)`
   (fired non-blocking, like the post-sync challenge evaluation).
2. For each of the member's groups that has the spotlight enabled **and** a
   Discord destination (and ≥2 members):
   - Claim the games in the ledger (cap: 10 — Discord's button limit).
   - Count how many members already own each claimed game.
   - Post the announcement embed (bot-backed primary, webhook fallback — same
     dual transport as `releases-notifier`).
   - Open an interactive vote via `createVotingSession({ games })`. Best-effort:
     if a vote is already open for the group (one-open-per-group rule) the
     announcement still went out and members can vote on the site.

## Surface area

- **Migration** `20260605_add_new_game_spotlight.ts`: `groups.new_game_spotlight_enabled`
  + `group_game_spotlights` ledger table.
- **Domain** `new-game-spotlight.ts` (orchestration + `diffNewlyAcquired`),
  `create-session.ts` (optional explicit `games` override).
- **Transport** `infrastructure/discord/spotlight-notifier.ts` (announcement embed).
- **Sync hook** `auth.routes.ts` → `syncUserLibrary`.
- **API** `PATCH /api/groups/:id/new-game-spotlight` (owner only, free) + field on
  the group detail response.
- **Frontend** owner toggle in the group settings "Groupe" section, disabled when
  no Discord channel is linked; store/api/i18n wiring.
- **Tests** pure helpers (`diffNewlyAcquired`, `ownershipHint`, `buildSpotlightEmbed`).

## Future work

- Combine the announcement and the interactive vote into one message by
  threading a spotlight context through the bot's session contract (needs a
  `voting_sessions.spotlight_context` column so live edits/close keep the copy).
- Filter to co-op / multiplayer only (mirror the digest's `coopOnly` knob).
- Detection for Epic / GOG syncs (currently Steam only).
