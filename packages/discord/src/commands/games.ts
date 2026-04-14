import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { backendApi } from '../lib/api.js'
import { resolveGroup } from '../lib/resolve-group.js'

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
  .setDescription('Afficher les jeux en commun du groupe')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  const group = await resolveGroup(interaction)
  if (!group) return

  try {
    const result = await backendApi<CommonGamesResponse>(
      `/api/discord/games?groupId=${group.groupId}`,
      { discordUserId: interaction.user.id },
    )

    if (result.games.length === 0) {
      await interaction.editReply({
        content: `😕 Aucun jeu en commun trouvé pour **${group.groupName}**.`,
        components: [],
      })
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

    // Post the game list publicly in the channel.
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds: [embed] })
    }

    await interaction.editReply({
      content: `✅ Jeux en commun affichés pour **${group.groupName}**.`,
      components: [],
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ Erreur : ${error instanceof Error ? error.message : 'Impossible de récupérer les jeux'}`,
      components: [],
    })
  }
}
