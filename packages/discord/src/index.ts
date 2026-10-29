import { Client, GatewayIntentBits, Events, REST, Routes, type Interaction, type Message } from 'discord.js'
import { validateEnv, env } from './env.js'
import { backendApi, BackendApiError } from './lib/api.js'
import { startHttpApi } from './http/server.js'
import { startScheduler } from './scheduler.js'
import { getTodayPersona, getDefaultPersona, getPersonaById, type Persona } from './personas.js'
import { getBotSettings } from './lib/api.js'

async function getActivePersona(): Promise<Persona> {
  try {
    const settings = await getBotSettings()
    if (settings.persona_override) {
      const override = getPersonaById(settings.persona_override)
      if (override) return override
    }
    if (!settings.persona_rotation_enabled) return getDefaultPersona()
    return getTodayPersona(settings.disabled_personas ?? [])
  } catch {
    return getTodayPersona()
  }
}
import * as setupCommand from './commands/setup.js'
import * as linkCommand from './commands/link.js'
import * as gamesCommand from './commands/games.js'
import * as voteCommand from './commands/vote.js'
import * as randomCommand from './commands/random.js'
import * as dailyChallengeCommand from './commands/daily-challenge.js'
import * as statsCommand from './commands/stats.js'
import * as configCommand from './commands/config.js'

validateEnv()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

const commands = new Map([
  ['wawptn-setup', setupCommand],
  ['wawptn-link', linkCommand],
  ['wawptn-games', gamesCommand],
  ['wawptn-vote', voteCommand],
  ['wawptn-random', randomCommand],
  ['wawptn-daily-challenge', dailyChallengeCommand],
  ['wawptn-stats', statsCommand],
  ['wawptn-config', configCommand],
])

client.once(Events.ClientReady, async (c) => {
  console.log(`Discord bot ready as ${c.user.tag}`)

  try {
    const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN)
    const commandData = [...commands.values()].map(cmd => cmd.data.toJSON())

    await rest.put(
      Routes.applicationCommands(env.DISCORD_APPLICATION_ID),
      { body: commandData },
    )

    console.log(`Registered ${commandData.length} slash commands`)
  } catch (error) {
    console.error('Failed to register slash commands:', error)
  }

  try {
    startHttpApi(c)
  } catch (err) {
    console.error('[startup] Failed to start bot HTTP API:', err)
  }

  startScheduler(c).catch(err => {
    console.error('[startup] Failed to start scheduler:', err)
  })

  for (const [, guild] of c.guilds.cache) {
    guild.members.fetch().catch(err => {
      console.warn(`[startup] Could not prefetch members for guild ${guild.id}:`, err?.message ?? err)
    })
  }
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error)
      const reply = { content: '❌ Une erreur est survenue.', ephemeral: true }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply)
      } else {
        await interaction.reply(reply)
      }
    }
    return
  }

  if (interaction.isButton()) {
    const parts = interaction.customId.split(':')
    const action = parts[0]

    if (action === 'vote') {
      const [, sessionId, steamAppIdStr, vote] = parts
      if (!sessionId || !steamAppIdStr || !vote) return

      await interaction.deferReply({ ephemeral: true })

      try {
        const status = await backendApi<{ linked: boolean; userId?: string }>(`/api/discord/link/status`, {
          discordUserId: interaction.user.id,
        })

        if (!status.linked) {
          await interaction.editReply({
            content: '🔗 Vous devez d\'abord lier votre compte ! Utilisez la commande `/wawptn-link`.',
          })
          return
        }

        const steamAppId = parseInt(steamAppIdStr, 10)
        await backendApi(`/api/discord/vote`, {
          method: 'POST',
          discordUserId: interaction.user.id,
          body: {
            sessionId,
            steamAppId,
            vote: vote === 'yes',
          },
        })

        await interaction.editReply({
          content: `✅ Vote enregistré : ${vote === 'yes' ? '👍' : '👎'}`,
        })
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'Erreur lors du vote'}`,
        })
      }
      return
    }

    if (action === 'daily-challenge') {
      const challengeId = parts[1]
      if (!challengeId) return

      await interaction.deferReply({ ephemeral: true })

      try {
        const status = await backendApi<{ linked: boolean; userId?: string }>(`/api/discord/link/status`, {
          discordUserId: interaction.user.id,
        })

        if (!status.linked) {
          await interaction.editReply({
            content: '🔗 Vous devez d\'abord lier votre compte ! Utilisez la commande `/wawptn-link`.',
          })
          return
        }

        const result = await backendApi<{ rank: number; totalClaims: number; firstClaimer: boolean }>(
          `/api/discord/daily-challenge/claim`,
          {
            method: 'POST',
            discordUserId: interaction.user.id,
            body: { challengeId },
          },
        )

        const message = result.firstClaimer
          ? '🥇 Bravo ! Tu es le premier à relever le défi aujourd\'hui !'
          : `Rang #${result.rank} sur ${result.totalClaims} — tu as relevé le défi !`

        await interaction.editReply({ content: message })
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'Erreur lors de la validation du défi'}`,
        })
      }
      return
    }
  }
})

const channelCooldowns = new Map<string, number>()
const COOLDOWN_MS = 5_000

const MAX_MENTIONABLE_MEMBERS = 25

interface MentionableMember {
  id: string
  displayName: string
}

function collectMentionableMembers(message: Message): MentionableMember[] {
  const out = new Map<string, MentionableMember>()

  const add = (id: string, displayName: string | null | undefined) => {
    if (!id || out.has(id)) return
    if (out.size >= MAX_MENTIONABLE_MEMBERS) return
    const name = (displayName ?? '').trim()
    if (!name) return
    out.set(id, { id, displayName: name })
  }

  const authorMember = message.member
  add(message.author.id, authorMember?.displayName ?? message.author.username)

  for (const [userId, user] of message.mentions.users) {
    if (user.bot) continue
    const guildMember = message.guild?.members.cache.get(userId)
    add(userId, guildMember?.displayName ?? user.username)
  }

  if (message.guild) {
    for (const [, member] of message.guild.members.cache) {
      if (out.size >= MAX_MENTIONABLE_MEMBERS) break
      if (member.user.bot) continue
      add(member.id, member.displayName)
    }
  }

  return Array.from(out.values())
}

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return

  if (
    !client.user ||
    !message.mentions.has(client.user, {
      ignoreEveryone: true,
      ignoreRoles: true,
      ignoreRepliedUser: true,
    })
  )
    return

  const now = Date.now()
  const lastResponse = channelCooldowns.get(message.channelId)
  if (lastResponse && now - lastResponse < COOLDOWN_MS) return
  channelCooldowns.set(message.channelId, now)

  const cleanContent = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim()

  if (!cleanContent) {
    const persona = await getActivePersona()
    await message.reply(persona.emptyMentionReply)
    return
  }

  try {
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping()
    }

    const persona = await getActivePersona()

    if (message.guild && message.guild.members.cache.size <= 1) {
      await Promise.race([
        message.guild.members.fetch().then(() => undefined),
        new Promise<void>(resolve => setTimeout(resolve, 2_000)),
      ]).catch(err => {
        console.warn('[chat] guild member fetch failed:', err?.message ?? err)
      })
    }

    const guildMembers = collectMentionableMembers(message)

    const response = await backendApi<{ reply: string }>('/api/discord/chat', {
      method: 'POST',
      discordUserId: message.author.id,
      body: {
        channelId: message.channelId,
        message: cleanContent,
        personaVoice: persona.systemPromptOverlay,
        guildMembers,
      },
    })

    await message.reply({
      content: response.reply,
      allowedMentions: {
        parse: ['users'],
        repliedUser: true,
      },
    })
  } catch (error) {
    if (error instanceof BackendApiError) {
      if (error.status === 429 || error.code === 'rate_limited') {
        await message.reply('Doucement ! Laisse-moi respirer deux secondes. Réessaie dans quelques minutes.')
        return
      }
      console.warn('[chat] suppressed error', {
        status: error.status,
        code: error.code,
        message: error.message,
      })
      return
    }

    console.error('[chat] Error handling message:', error)
  }
})

client.login(env.DISCORD_BOT_TOKEN)

let shuttingDown = false
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] received ${signal}, closing Discord client...`)
  const forceExit = setTimeout(() => process.exit(1), 10_000)
  forceExit.unref()
  try {
    await client.destroy()
  } catch (err) {
    console.error('[shutdown] error destroying client:', err)
  }
  clearTimeout(forceExit)
  process.exit(0)
}
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason)
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err)
  process.exit(1)
})
