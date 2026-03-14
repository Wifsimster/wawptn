import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { backendApi } from '../lib/api.js'

interface CommonGamesResponse {
  groupName: string
  games: Array<{
    gameName: string
    steamAppId: number
    ownerCount: number
    totalMembers: number
  }>
}

export const data = new SlashCommandBuilder()
  .setName('wawptn-games')
  .setDescription('Afficher les jeux en commun du groupe lié à ce canal')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId

  await interaction.deferReply()

  try {
    const result = await backendApi<CommonGamesResponse>(`/api/discord/games?channelId=${channelId}`)

    if (result.games.length === 0) {
      await interaction.editReply({ content: '😕 Aucun jeu en commun trouvé pour ce groupe.' })
      return
    }

    const gameList = result.games
      .slice(0, 20)
      .map((g, i) => `**${i + 1}.** ${g.gameName} (${g.ownerCount}/${g.totalMembers} joueurs)`)
      .join('\n')

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Jeux en commun — ${result.groupName}`)
      .setDescription(gameList)
      .setColor(0x5865F2)
      .setFooter({ text: `${result.games.length} jeux en commun au total` })

    await interaction.editReply({ embeds: [embed] })
  } catch (error) {
    await interaction.editReply({
      content: `❌ Erreur : ${error instanceof Error ? error.message : 'Impossible de récupérer les jeux'}`,
    })
  }
}
