# Discord bot

The bot (`packages/discord`, discord.js) lets a server vote from Discord, links a channel to a group, posts vote announcements and results, and talks through an LLM when one is configured. It runs as a separate process and calls the backend's bot API with `DISCORD_BOT_API_SECRET`; the backend calls the bot's internal HTTP API on `DISCORD_BOT_HTTP_URL`.

## Sub-features

- `bot-commands` are the slash commands in `packages/discord/src/commands/`.
- `channel-link` is "Lier un salon" on the group page, then the bot invite.
- `vote-announce` posts session created and closed messages to the linked channel.
- `magic-link` turns a Discord user into a group member through the Steam callback (`discord_auth_intents`).

## How to get to it (user POV)

- A Discord server with the bot invited.
- `/groups/<id>` → "Lier un salon" (the card shows even with the Discord variables empty; the bot invite URL is then empty).
- `/discord/link` for account linking.

## Driving it with control-wawptn

Preconditions:

- None: this feature is **out of scope** for the harness.

- The bot logs in to the Discord gateway with a real token. The repo has no local fake of the gateway or of the REST API, so the bot cannot run offline. `launch` leaves every Discord variable empty, and the backend then skips bot-backed posting.
- What you can prove locally: with the Discord variables empty, a full vote leaves `egress-blocked.jsonl` empty (no webhook or bot call was even attempted). Report every bot behavior as not verified, with this reason.

## Gotchas

- Do not set a real `DISCORD_BOT_TOKEN` in a verification run. It would post to real servers.
- Adding a local fake is a separate project: a gateway stub plus the REST routes the bot uses.
