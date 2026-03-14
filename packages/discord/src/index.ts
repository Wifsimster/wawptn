import { Client, GatewayIntentBits, Events, type Interaction } from 'discord.js'
import { validateEnv, env } from './env.js'
import { backendApi } from './lib/api.js'
import * as setupCommand from './commands/setup.js'
import * as linkCommand from './commands/link.js'
import * as gamesCommand from './commands/games.js'

validateEnv()

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
})

const commands = new Map([
  ['wawptn-setup', setupCommand],
  ['wawptn-link', linkCommand],
  ['wawptn-games', gamesCommand],
])

client.once(Events.ClientReady, (c) => {
  console.log(`Discord bot ready as ${c.user.tag}`)
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

client.login(env.DISCORD_BOT_TOKEN)
