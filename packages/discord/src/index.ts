import { Client, GatewayIntentBits, Events, REST, Routes, type Interaction, type Message } from 'discord.js'
import { validateEnv, env } from './env.js'
import { backendApi } from './lib/api.js'
import { startScheduler, notifyBackOnline } from './scheduler.js'
import { getTodayPersona, getDefaultPersona, type Persona } from './personas.js'
import { getBotSettings } from './lib/api.js'

async function getActivePersona(): Promise<Persona> {
  try {
    const settings = await getBotSettings()
    return settings.persona_rotation_enabled ? getTodayPersona() : getDefaultPersona()
  } catch {
    return getTodayPersona()
  }
}
import * as setupCommand from './commands/setup.js'
import * as linkCommand from './commands/link.js'
import * as gamesCommand from './commands/games.js'
import * as voteCommand from './commands/vote.js'
import * as randomCommand from './commands/random.js'

validateEnv()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

const commands = new Map([
  ['wawptn-setup', setupCommand],
  ['wawptn-link', linkCommand],
  ['wawptn-games', gamesCommand],
  ['wawptn-vote', voteCommand],
  ['wawptn-random', randomCommand],
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

  // Start scheduled reminder messages (fetches settings from backend)
  startScheduler(c).catch(err => {
    console.error('[startup] Failed to start scheduler:', err)
  })

  // Notify linked channels that the bot is back online
  notifyBackOnline(c).catch(err => {
    console.error('[startup] Failed to send back-online notification:', err)
  })
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

  // Handle button interactions (voting)
  if (interaction.isButton()) {
    const [action, sessionId, steamAppIdStr, vote] = interaction.customId.split(':')
    if (action !== 'vote' || !sessionId || !steamAppIdStr || !vote) return

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
  }
})

// ─── Conversational message handler (@mention) ──────────────────────────────

// Per-channel cooldown to prevent spam (5s between bot responses)
const channelCooldowns = new Map<string, number>()
const COOLDOWN_MS = 5_000

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return

  // Only respond when the bot is @mentioned
  if (!client.user || !message.mentions.has(client.user)) return

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
    const response = await backendApi<{ reply: string }>('/api/discord/chat', {
      method: 'POST',
      discordUserId: message.author.id,
      body: {
        channelId: message.channelId,
        message: cleanContent,
        personaVoice: persona.systemPromptOverlay,
      },
    })

    await message.reply(response.reply)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'

    // Rate limited
    if (errorMessage.includes('trop de questions') || errorMessage.includes('rate')) {
      await message.reply('Doucement ! Laisse-moi respirer deux secondes. Réessaie dans quelques minutes.')
      return
    }

    // LLM not configured
    if (errorMessage.includes('not_configured') || errorMessage.includes('not enabled')) {
      return // Silently ignore if LLM is not set up
    }

    await message.reply('Oups, j\'ai perdu le fil. Réessaie dans un instant !')
    console.error('[chat] Error handling message:', error)
  }
})

client.login(env.DISCORD_BOT_TOKEN)
