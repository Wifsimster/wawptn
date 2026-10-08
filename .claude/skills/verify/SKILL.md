---
name: verify
description: Launch and drive WAWPTN (group game picker, React SPA + Express/socket.io API + Postgres) like a group of friends, on a throwaway DB with three fake Steam players and fake games, and capture proof (screenshots, ARIA snapshots, API bodies, DB rows, socket.io frames). Use to prove any user-visible change (groups, invites, voting, common games) or to reproduce a bug before claiming it fixed.
---

# Verify WAWPTN

Primary surface: the web UI at `http://localhost:5173` (Vite dev server, proxies `/api`, `/invite` and `/socket.io` to the backend on `:3000`). The UI is French only. Secondary surfaces, not covered by the harness: the Discord bot (`packages/discord`), Steam sign-in itself, Epic/GOG library linking and Stripe premium.

Everything goes through one CLI, `control-wawptn`. Each call prints one JSON object (`ok`, data, and on failure `error` + `fix`). Run it from the repo root:

```bash
C=.claude/skills/verify/scripts/control-wawptn.mjs   # or: node $C ...
$C --help                 # command list
$C <command> --help       # flags, side effects, what it proves
```

Prerequisites: `npm ci` at the repo root, Docker, and the Playwright Chromium that matches the repo's Playwright version (`cd packages/frontend && npx playwright install chromium`). Without that browser `launch` refuses to start before it touches anything, and `doctor` fails its `playwrightChromium` check. After a `@playwright/test` bump, install the browser again.

## Launch

```bash
export WAWPTN_EVIDENCE_DIR=/somewhere/outside/the/checkout   # recommended, see Evidence
$C launch --dry-run   # prints ports, container and steps; touches nothing
$C launch             # ~10 s warm
```

`launch` does the following, in order:

1. Starts the Docker container `wawptn-verify-pg` (Postgres 16 on `127.0.0.1:55442`, tmpfs, so the data dies with the container). It carries the label `wawptn-verify=1`.
2. Builds `@wawptn/types` and runs `db:migrate`.
3. Seeds fake data with `psql`: the players `alice`, `bob`, `carol` (Steam ids `7656119000000000{1,2,3}`, which no real account has) and six fake games (app ids `9900001`–`9900006`). All three players own four of them: `Verify Quest`, `Fake Kart Party`, `Throwaway Tactics` and `Placeholder Raiders`. Each game has a `game_metadata` row marked as enriched, so the backend never asks the Steam store for details.
4. Starts the backend (`tsx src/index.ts`) with `scripts/no-egress.mjs` preloaded. It refuses every HTTP(S) call to a host other than localhost and logs it to `.verify-run/egress-blocked.jsonl`.
5. Starts Vite (`--strictPort`). Logs go to `.verify-run/logs/`.
6. Starts a headless Chromium daemon (CDP on `:9334`) that every later command attaches to. It holds one persistent page and records console, HTTP and socket.io traffic to JSONL. Steam CDN images get a local placeholder, and every other third-party request is aborted and logged with status `blocked`.

`launch` is ready when it returns `"ok": true`. By then it has already waited for `/health`, Vite and the CDP port. It forces `STEAM_API_KEY`, the Epic/GOG, Discord, LLM, Stripe, Resend, Koe and alert-webhook variables to empty values.

`API_URL` is set to the Vite origin (`http://localhost:5173`), not the backend port. In production one origin serves the API and the SPA. The invite page `/invite/<token>` redirects to `${API_URL}/join/<token>`, so with the backend port the link would land on an Express 404.

Isolation: one instance per host. The Vite proxy hardcodes `localhost:3000`, so ports 3000, 5173, 9334 and 55442 are fixed. `launch` refuses to start when any of them is busy or when `.verify-run/state.json` exists. Never point the CLI at an instance you did not launch. Never run `compose.local.yml` alongside it: that file binds 5432, and the host's 5432 already belongs to another project.

## Doctor

```bash
$C doctor   # read-only; exit 0 only if every check passes
```

`doctor` checks:

- the recorded PIDs are alive and the labelled container is running
- `/health` reports `ok` (the DB answers)
- Vite answers and the CDP port is open
- the Playwright Chromium is installed
- the three fake players exist and exactly four fake games are common to all three
- `egressBlocked`: how many outbound calls the backend tried (informational; read the log when it is not 0)
- the git SHA of the checkout

Run `doctor` first whenever anything looks off, and read its `hints`.

## Drive

Steam OpenID is the only sign-in method and it needs `steamcommunity.com`, so the harness stops at that boundary. `$C login --as alice|bob|carol` inserts a `sessions` row for the fake player (the same row `createUserSession()` writes after a successful Steam callback), signs the token with the run's throwaway `APP_SECRET`, and sets the `wawptn.session_token` cookie. It clears every other cookie first, so it also switches player. Everything after login goes through the real UI.

Use roles and accessible names from `packages/frontend/src/i18n/locales/fr.json`. Find them with `$C snapshot` rather than guessing CSS.

| Goal | Command |
|---|---|
| Become a player (also switches player) | `$C login --as alice` |
| Create a group from `/` ("Créer"), read the invite link from the dialog | `$C group create --name "Soirée test"` |
| Open the last group's invite link as the current player | `$C group join` |
| Group row and members from the DB | `$C group show` |
| Start a vote from the group page ("Lancer un vote", then "Lancer le vote") | `$C vote start` |
| Fill and submit the current player's ballot | `$C vote cast --pick "Fake Kart Party,Verify Quest"` or `--pick 1,3` |
| Close the vote and read the revealed winner (session creator only) | `$C vote close` |
| Session, games and every ballot from the DB | `$C vote show` |
| Navigate | `$C goto /groups/<id>` |
| Click by role and name | `$C click --role button --name "^Au hasard$"` |
| Keyboard | `$C key Escape` |
| ARIA tree (also saved as `.aria.yml`) | `$C snapshot [--name x] [--selector main]` |
| PNG | `$C screenshot --name x [--full-page]` |
| Browser console since launch | `$C console --level error --last 20` |
| HTTP and socket.io log | `$C network-log --filter /api/groups --status-min 400` / `--filter socket.io` |
| Recorded run, players, games, evidence dir | `$C info` |

`group` and `vote` default to the run's last group (from `group create`). Pass `--group <uuid>` to target another one. Commands with side effects accept `--dry-run`: `launch`, `teardown`, `login`, `click`, `group create|join` and `vote start|cast|close`.

A full group session, as one sequence:

```bash
$C login --as alice && $C group create
$C login --as bob   && $C group join
$C login --as carol && $C group join
$C login --as alice && $C vote start && $C vote cast --pick 1,2
$C login --as bob   && $C vote cast --pick 1
$C login --as carol && $C vote cast --pick 1
$C login --as alice && $C vote close
```

The feature map in [`features/README.md`](features/README.md) has one recipe per feature. A proof that drives one entry point does not cover the others listed there.

## Evidence

- Location: `$WAWPTN_EVIDENCE_DIR/<runId>/`, or `.verify-evidence/<runId>/` at the repo root (gitignored) when the variable is unset. `launch` records the root in `state.json`, so later commands write to the same place even from a shell without the variable. Every file is named `<timestamp>_<label>`. Each `group` and `vote` step writes before/after screenshots and a `.json` with the HTTP response and the DB rows it read back.
- Teardown copies `.verify-run/logs/*.log`, `console.jsonl`, `network.jsonl` and `egress-blocked.jsonl` into `<runId>/run-logs/` before deleting the scratch state.
- Proof standards:
  - Drive the real user path: the create dialog, the invite link, the ballot cards and the close button. Do not POST to the API yourself.
  - Capture the action and the resulting state: before/after screenshots plus the HTTP response.
  - Check the side effect with a second read: `group_members`, `voting_sessions`, `votes` rows (`$C group show`, `$C vote show`), and socket.io frames (`vote:cast`, `vote:closed`, `member:joined`) in `network-log`.
  - The login seam is the one deliberate shortcut. Say so when a proof depends on it, and never use it to claim the Steam button works.
  - For a bug, reproduce it on the same surface first, then show it gone.
- In a git worktree the default evidence dir dies with `git worktree remove`. Set `WAWPTN_EVIDENCE_DIR` outside the checkout before `launch`.

## Cleanup

```bash
$C teardown --dry-run   # lists PIDs, the labelled container and paths it would remove
$C teardown
```

`teardown` does the following:

- kills only the process groups recorded in `state.json`, never by process name
- removes the container only if it carries the label `wawptn-verify=1`
- deletes `.verify-run/`
- reports `portsStillOpen`, which must be empty
- never deletes the evidence

Run it after every failed iteration too, so a broken attempt does not leave processes or ports behind.

## Helpers

- `scripts/control-wawptn.mjs` is the CLI. It is a Node ESM script with no dependencies beyond the repo's `@playwright/test`, Docker and `psql` inside the Postgres container. Every subcommand has `--help`.
- `scripts/no-egress.mjs` is preloaded into the backend by `launch` (`tsx --import`). It wraps `fetch`, `http.request/get` and `https.request/get`. Do not import it anywhere else.

## Gotchas

- **Two `POST /api/groups/join` per invite in dev.** React StrictMode runs the `JoinPage` effect twice. Before PR #247 the second request failed with a 500 and the page showed "Impossible de rejoindre" although the player had joined. `group join` reports every join response and fails when the error page shows.
- **Expected 404 noise.** `/api/koe/identity` and `/api/subscription/me` answer 404 because Koe and Stripe are disabled. They show as console errors. Filter them out before you call a run clean.
- **Free tier limits.** A non-premium player can own 2 groups, and a group of a non-premium owner is capped in members. A third `group create` as the same player answers 403.
- **Rate limit on `/api/groups`.** `voteLimiter` allows 30 requests per minute per client IP on the vote routes. Production runs behind Traefik with `trust proxy` = 1, so each player has an IP. Through the Vite proxy every fake player comes from 127.0.0.1, so the browser daemon adds `X-Forwarded-For: 10.77.0.<n>` per player to `/api/` requests (the header Traefik would add). Without it, a full session hits 429 on `vote close`. If you still get a 429, wait a minute; do not loop.
- **Only the session creator sees "Clôturer le vote".** Run `vote close` as the player who ran `vote start`, after that player has cast a ballot.
- **One ballot per player per session.** A second `vote cast` by the same player fails: the ballot is gone and the page shows "Vote soumis !".
- **Steam library sync never runs.** Libraries come from the seed. Anything that triggers a sync (the owner's "sync" action, a real Steam callback) hits the egress guard and shows in `doctor`'s `egressBlocked`.
- **Ports are fixed** (see Isolation). Do not edit the Vite proxy to work around a busy port. Find who owns the port instead.
