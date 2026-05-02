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
    // Admin override takes priority
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
    // Privileged intent — required so the bot can resolve pseudos to user
    // IDs when the LLM is asked to ping someone (issue #182). Must also be
    // toggled ON in Discord Developer Portal → Bot → "Server Members Intent",
    // otherwise the gateway will refuse the connection.
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

  // Auto-register slash commands on startup
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

  // Start the internal HTTP API the backend uses to push session events
  // (create/update/close) onto the Gateway-connected client.
  try {
    startHttpApi(c)
  } catch (err) {
    console.error('[startup] Failed to start bot HTTP API:', err)
  }

  // Start scheduled reminder messages (fetches settings from backend)
  startScheduler(c).catch(err => {
    console.error('[startup] Failed to start scheduler:', err)
  })

  // Prime the guild member cache in the background so the conversational
  // handler can resolve pseudos to IDs even when the target hasn't chatted
  // recently. Requires the GuildMembers privileged intent.
  for (const [, guild] of c.guilds.cache) {
    guild.members.fetch().catch(err => {
      console.warn(`[startup] Could not prefetch members for guild ${guild.id}:`, err?.message ?? err)
    })
  }
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Handle slash commands
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

  // Handle button interactions
  if (interaction.isButton()) {
    const parts = interaction.customId.split(':')
    const action = parts[0]

    // ─── Voting buttons ──────────────────────────────────────────────────
    if (action === 'vote') {
      const [, sessionId, steamAppIdStr, vote] = parts
      if (!sessionId || !steamAppIdStr || !vote) return

      await interaction.deferReply({ ephemeral: true })

      try {
        // Check if Discord user is linked
        const status = await backendApi<{ linked: boolean; userId?: string }>(`/api/discord/link/status`, {
          discordUserId: interaction.user.id,
        })

        if (!status.linked) {
          await interaction.editReply({
            content: '🔗 Vous devez d\'abord lier votre compte ! Utilisez la commande `/wawptn-link`.',
          })
          return
        }

        // Cast the vote via backend API
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

    // ─── Daily challenge claim button ────────────────────────────────────
    if (action === 'daily-challenge') {
      const challengeId = parts[1]
      if (!challengeId) return

      await interaction.deferReply({ ephemeral: true })

      try {
        // Check if Discord user is linked
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

// ─── Conversational message handler (@mention) ──────────────────────────────

// Per-channel cooldown to prevent spam (5s between bot responses)
const channelCooldowns = new Map<string, number>()
const COOLDOWN_MS = 5_000

// Upper bound on the number of mentionable members shipped to the LLM per
// message. 25 is plenty for a typical friend group and keeps the prompt
// from ballooning on large Discord servers.
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

  // 1. The author — the LLM often needs to reply to them by name.
  const authorMember = message.member
  add(message.author.id, authorMember?.displayName ?? message.author.username)

  // 2. Users explicitly mentioned in the message (Jarhx in "ping Jarhx").
  for (const [userId, user] of message.mentions.users) {
    if (user.bot) continue
    const guildMember = message.guild?.members.cache.get(userId)
    add(userId, guildMember?.displayName ?? user.username)
  }

  // 3. Fill remaining slots from the guild member cache so the LLM can
  // resolve names that weren't explicitly @mentioned ("propose à Jarhx").
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
  // Ignore bot messages
  if (message.author.bot) return

  // Only respond on an explicit @mention of the bot. The discord.js default
  // for `mentions.has()` also matches @everyone/@here, any role the bot
  // happens to carry, and the replied-user on every reply to one of our
  // own messages — which made the bot spam-reply to every @everyone
  // announcement and every thread reply. Narrow the match to direct
  // user-mentions only.
  if (
    !client.user ||
    !message.mentions.has(client.user, {
      ignoreEveryone: true,
      ignoreRoles: true,
      ignoreRepliedUser: true,
    })
  )
    return

  // Channel cooldown
  const now = Date.now()
  const lastResponse = channelCooldowns.get(message.channelId)
  if (lastResponse && now - lastResponse < COOLDOWN_MS) return
  channelCooldowns.set(message.channelId, now)

  // Strip the bot mention from the message to get the actual question
  const cleanContent = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim()

  // If empty after stripping mention, send a hint
  if (!cleanContent) {
    const persona = await getActivePersona()
    await message.reply(persona.emptyMentionReply)
    return
  }

  try {
    // Show typing indicator while waiting for the LLM
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping()
    }

    const persona = await getActivePersona()

    // Best-effort: ensure the guild member cache is populated so the LLM can
    // resolve pseudos mentioned in plain text (e.g. "ping Sparx" without a
    // real @mention). Safe to call repeatedly — discord.js de-duplicates the
    // underlying gateway request. Times out quickly so a slow Discord API
    // never blocks the chat reply.
    if (message.guild && message.guild.members.cache.size <= 1) {
      await Promise.race([
        message.guild.members.fetch().then(() => undefined),
        new Promise<void>(resolve => setTimeout(resolve, 2_000)),
      ]).catch(err => {
        console.warn('[chat] guild member fetch failed:', err?.message ?? err)
      })
    }

    // Build a list of mentionable guild members so the LLM can ping them by
    // emitting <@id> syntax. Prioritise the author + explicitly mentioned
    // users; fill the rest from the cached member list. Capped to keep the
    // request payload small and to stay within the LLM context window.
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
      // Restrict parsing to user mentions the bot is explicitly authorised
      // to ping — the backend already ensures only known member IDs are
      // emitted, but this is a defence-in-depth against @everyone/@here
      // and role mentions that might slip through.
      allowedMentions: {
        parse: ['users'],
        repliedUser: true,
      },
    })
  } catch (error) {
    // Rate limit is the only error worth surfacing to the user — everything
    // else (LLM disabled, premium gate, LLM provider 5xx, transient bugs)
    // is either a server-side problem or a configuration the user can't
    // act on from the channel. For those, stay silent instead of spamming
    // a cryptic "j'ai perdu le fil" reply on every @mention.
    if (error instanceof BackendApiError) {
      if (error.status === 429 || error.code === 'rate_limited') {
        await message.reply('Doucement ! Laisse-moi respirer deux secondes. Réessaie dans quelques minutes.')
        return
      }
      // Known silent cases: 501 not_configured, 403 premium_required,
      // 503 llm_error, 4xx validation. Log at info so ops can still see
      // what's happening without the user seeing an error.
      console.warn('[chat] suppressed error', {
        status: error.status,
        code: error.code,
        message: error.message,
      })
      return
    }

    // Unexpected (network / Discord-side) error — log loudly, stay silent.
    console.error('[chat] Error handling message:', error)
  }
})

client.login(env.DISCORD_BOT_TOKEN)
