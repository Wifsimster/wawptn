import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { backendApi, getBotSettings } from '../lib/api.js'
import { resolveGroup } from '../lib/resolve-group.js'
import { getTodayPersona, getDefaultPersona, getPersonaById, type Persona } from '../personas.js'

interface DailyChallengeResponse {
  challenge: {
    id: string
    steamAppId: number
    gameId: string | null
    gameName: string
    headerImageUrl: string | null
    alreadyExists: boolean
  }
}

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

export const data = new SlashCommandBuilder()
  .setName('wawptn-daily-challenge')
  .setDescription('Lancer le défi du jour pour ton groupe')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  const group = await resolveGroup(interaction)
  if (!group) return

  try {
    const result = await backendApi<DailyChallengeResponse>(
      '/api/discord/daily-challenge/create',
      {
        method: 'POST',
        discordUserId: interaction.user.id,
        body: {
          channelId: interaction.channelId,
          guildId: interaction.guildId ?? '',
        },
      },
    )

    const { challenge } = result
    const persona = await getActivePersona()

    const embed = new EmbedBuilder()
      .setTitle('🎯 Défi du jour !')
      .setDescription(
        `Qui jouera à **${challenge.gameName}** en premier aujourd'hui ?\n\n` +
          `Clique sur le bouton ci-dessous pour relever le défi !`,
      )
      .setColor(persona.embedColor ?? 0xFEE75C)
      .setFooter({ text: `WAWPTN — ${persona.name}` })
      .setTimestamp()

    if (challenge.headerImageUrl) {
      embed.setImage(challenge.headerImageUrl)
    }

    if (challenge.steamAppId) {
      embed.setURL(`https://store.steampowered.com/app/${challenge.steamAppId}`)
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`daily-challenge:${challenge.id}`)
        .setLabel('🏆 Je relève le défi !')
        .setStyle(ButtonStyle.Primary),
    )

    // Send the challenge as a public message
    if (interaction.channel && 'send' in interaction.channel) {
      const sent = await interaction.channel.send({ embeds: [embed], components: [row] })

      // Store the Discord message ID so we can reference it later
      try {
        await backendApi(`/api/discord/daily-challenge/${challenge.id}/message`, {
          method: 'PATCH',
          body: { messageId: sent.id },
        })
      } catch (err) {
        console.error('[daily-challenge] Failed to store message ID:', err)
      }
    }

    const replyContent = challenge.alreadyExists
      ? `ℹ️ Le défi du jour pour **${group.groupName}** a déjà été lancé aujourd'hui.`
      : `🎯 Défi du jour lancé dans **${group.groupName}** !`

    await interaction.editReply({
      content: replyContent,
      components: [],
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ ${error instanceof Error ? error.message : 'Erreur lors du lancement du défi'}`,
      components: [],
    })
  }
}
