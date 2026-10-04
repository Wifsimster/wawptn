# Voting session

A group member starts a vote for tonight. The ballot holds the games every selected player owns. Each player picks the games they want, and the page shows live progress ("En attente des autres... N sur M ont voté"). The session creator closes the vote, and everyone sees the winner with "Ce soir vous jouez à" and a "Lancer sur Steam" link.

## Sub-features

- `vote-start` opens "Qui joue ce soir ?", selects players and starts the session (`POST /api/groups/<id>/vote`).
- `vote-ballot` shows the common games as "Sélectionner <game>" cards and submits them with "Valider ma sélection".
- `vote-progress` updates the waiting list over socket.io (`vote:cast`).
- `vote-close` reveals the winner (`POST .../close`, socket.io `vote:closed`), with consensus and "Lancer sur Steam".
- `vote-rematch` restarts with "Relancer un vote" from the result page.
- `vote-schedule` plans the evening for later ("Plus d'options" → "Planifier pour plus tard"); the scheduler closes it automatically.

## How to get to it (user POV)

- `/groups/<id>` → "Lancer un vote" (tab "Ce soir").
- `/` → "Lancer le vote" / "Rejoindre le vote" on a group card, or the "Un vote est en cours" banner.
- A direct URL: `/groups/<id>/vote`.
- An invite link while a vote is open drops the new member straight on the ballot.

## Driving it with control-wawptn

Preconditions:

- A fresh `$C launch`, `$C doctor` exits 0, and a group with alice (owner), bob and carol (see [group-invite.md](./group-invite.md)).

- **Start.** Run `$C login --as alice`, then `$C vote start`. Expect `response.status 201` with the four common games, `setupDialogPlayers` all checked, `session.status: "open"`, and `url` ending with `/vote`. `vote-started.png` shows "Choisis tes jeux".
- **Ballots.** Run `$C vote cast --pick 1,2` as alice, then `$C login --as bob` and `$C vote cast --pick "Verify Quest"`, then the same for carol. Each call shows `response.status 200`, `progressShown` ("N sur 3 ont voté"), and `votesRows` with one row per ballot game where `vote` is true exactly for the picks.
- **Close.** Run `$C login --as alice`, then `$C vote close`. Expect `progressBeforeClose` "3 sur 3", `response.result.gameName`, `winnerShown` equal to `session.winner`, and `session.status: "closed"`. `vote-result.png` shows the reveal.
- **Second read.** Run `$C vote show` for every ballot. Run `$C network-log --filter socket.io` and count `session:created`, `vote:cast` and `vote:closed` frames.
- **Rematch / schedule.** Not wrapped. Use `$C click --role button --name "Relancer un vote"`, or "Plus d'options" in the start dialog, then `$C snapshot`.

## Gotchas

- Only the session creator sees "Clôturer le vote et révéler le gagnant" (`canClose` in `use-vote-session.ts`), on the waiting screen after casting a ballot. The API also lets the group owner close.
- A player votes once per session. A second `vote cast` fails because the ballot no longer shows.
- Ties go to one of the tied games. Assert that the shown winner matches `winning_game_name`, not a game you guessed.
- "Lancer sur Steam" is a `steam://run/<appId>` link. Do not click it in the harness.
- `voteLimiter` allows 30 requests per minute per client IP on the vote routes. The harness gives each fake player its own `X-Forwarded-For` (see SKILL.md Gotchas). If a step still gets 429, wait a minute instead of retrying in a loop.
