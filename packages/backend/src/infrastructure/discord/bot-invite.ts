import { env } from '../../config/env.js'

export function isBotConfigured(): boolean {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_BOT_TOKEN)
}

export function buildBotInviteUrl(): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    scope: 'bot applications.commands',
    permissions: '274878221312',
  })
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}
