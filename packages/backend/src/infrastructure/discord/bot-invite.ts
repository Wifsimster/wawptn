/**
 * Build the Discord bot invite URL so a group owner can add the WAWPTN bot
 * to their own Discord server, then run `/wawptn-setup` in the target
 * channel to bind it to their group.
 *
 * There is no OAuth picker here — channel binding is driven entirely by the
 * bot's slash command (see `packages/discord/src/commands/setup.ts`) which
 * writes `discord_channel_id` / `discord_guild_id` on the group row via
 * `POST /api/discord/setup`. The frontend only needs to show the invite URL.
 */
import { env } from '../../config/env.js'

/** True when the backend has enough config to build an invite URL and let
 *  the bot authenticate its setup calls. */
export function isBotConfigured(): boolean {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_BOT_TOKEN)
}

export function buildBotInviteUrl(): string {
  // Permissions integer 274878221312 covers:
  //   VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS, ATTACH_FILES,
  //   READ_MESSAGE_HISTORY, USE_APPLICATION_COMMANDS, MANAGE_MESSAGES
  // — enough for vote messages, embeds, and cleanup.
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    scope: 'bot applications.commands',
    permissions: '274878221312',
  })
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}
