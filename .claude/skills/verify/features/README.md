# WAWPTN verification map

This directory is the maintained source for verifying the user-visible behavior of WAWPTN. Read this index before driving the app, then use the matching feature file as the recipe. `C=.claude/skills/verify/scripts/control-wawptn.mjs` throughout.

## Baseline preconditions

- `$C launch` has returned `"ok": true` and `$C doctor` exits 0.
- The database is the throwaway `wawptn-verify-pg` container. It holds the fake players `alice`, `bob` and `carol` and six fake games. The four games owned by all three players are `Verify Quest`, `Fake Kart Party`, `Throwaway Tactics` and `Placeholder Raiders`.
- Steam, Epic, GOG, Discord, Stripe, Resend, LLM, Koe and alert keys are empty. The backend cannot reach any third party (egress guard), and the browser only gets placeholder images from the Steam CDN.
- Never drive an instance that this run did not start.

## Driving conventions

- Start from a fresh `launch` when a recipe needs a clean group or vote history.
- Prefer ARIA roles and accessible names (`$C snapshot` shows them) over CSS. Labels come from `packages/frontend/src/i18n/locales/fr.json`.
- Switch player with `$C login --as <player>`. The browser holds one player at a time.
- Every command is literal: keep quoted names and flags unchanged.
- Use `--dry-run` first on anything that writes, when you only need to know what would happen.

## Proof and skip reporting

- Capture the user action and the resulting state: a before/after screenshot plus the HTTP response, not just the final screen.
- Every mutation needs a second, read-only view: a DB row (`$C group show`, `$C vote show`, or `docker exec wawptn-verify-pg psql -U wawptn -d wawptn -c ...`), or the socket.io frames in `$C network-log --filter socket.io`.
- Record the feature ID and entry point with every artifact. Evidence lives in `$WAWPTN_EVIDENCE_DIR/<runId>/`.
- An entry point you could not reach is reported with the command attempted and the unmet precondition, never as verified through another path.

## Feature entry contract

Each feature file has an H1 and one paragraph, then exactly four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-wawptn` (opens with `Preconditions:`), `Gotchas`.

## Features

- [Groups and invites](./group-invite.md) covers group creation, the invite link and joining through it. **Driven end to end in the pilot run.**
- [Voting session](./vote-session.md) covers starting a vote, ballots, live progress and the result reveal. **Driven end to end in the pilot run.**
- [Common games](./common-games.md) covers the "Jeux en commun" list, its filters, "Idée pour ce soir" and "Au hasard". The list was checked in the pilot run (4 common games, the 2 others absent); the filters and the random pick are recipes only.
- [Sign-in and session](./auth-session.md) covers the Steam sign-in boundary, the session cookie and logout. Steam sign-in is **not drivable**; the harness mints the session instead. Logout was driven in the pilot run.
- [Discord bot](./discord-bot.md) is **out of scope**: the bot needs the Discord gateway and the repo has no local fake.
