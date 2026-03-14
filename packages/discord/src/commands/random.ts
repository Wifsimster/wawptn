import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { backendApi } from '../lib/api.js'
import { resolveGroup } from '../lib/resolve-group.js'
import { buildRandomGameEmbed } from '../lib/embeds.js'

interface RandomGameResponse {
  groupName: string
  game: {
    gameName: string
    steamAppId: number
    headerImageUrl: string | null
  }
}

export const data = new SlashCommandBuilder()
  .setName('wawptn-random')
  .setDescription('Choisir un jeu au hasard parmi les jeux en commun')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  const group = await resolveGroup(interaction)
  if (!group) return

  try {
    const result = await backendApi<RandomGameResponse>(
      `/api/discord/random?groupId=${group.groupId}`,
      { discordUserId: interaction.user.id },
    )

    const embed = buildRandomGameEmbed(result.game, group.groupName)

    // Send the result as a public message
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds: [embed] })
    }

    await interaction.editReply({
      content: `🎲 Jeu choisi au hasard dans **${group.groupName}** !`,
      components: [],
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ ${error instanceof Error ? error.message : 'Erreur lors du tirage au sort'}`,
      components: [],
    })
  }
}
