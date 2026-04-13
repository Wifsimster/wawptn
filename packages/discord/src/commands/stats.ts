import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { backendApi } from '../lib/api.js'
import { resolveGroup } from '../lib/resolve-group.js'
import { buildStatsEmbed, type StatsResponse } from '../lib/embeds.js'

export const data = new SlashCommandBuilder()
  .setName('wawptn-stats')
  .setDescription('Afficher le classement et les statistiques du groupe')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  const group = await resolveGroup(interaction)
  if (!group) return

  try {
    const stats = await backendApi<StatsResponse>(
      `/api/discord/stats?groupId=${group.groupId}`,
      { discordUserId: interaction.user.id },
    )

    const embed = buildStatsEmbed(stats)

    // Post the leaderboard publicly so the whole channel sees it. The
    // ephemeral defer above is upgraded to an in-channel send to match the
    // pattern used by /wawptn-random.
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds: [embed] })
    }

    await interaction.editReply({
      content: `📊 Statistiques de **${group.groupName}** affichées dans le canal !`,
      components: [],
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ ${error instanceof Error ? error.message : 'Erreur lors de la récupération des stats'}`,
      components: [],
    })
  }
}
