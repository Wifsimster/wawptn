import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { backendApi } from '../lib/api.js'
import { resolveGroup } from '../lib/resolve-group.js'
import { buildSessionCreatedEmbed, type SessionGame } from '../lib/embeds.js'

interface VoteStartResponse {
  session: {
    id: string
    groupId: string
    status: string
    createdBy: string
    createdAt: string
  }
  games: SessionGame[]
}

export const data = new SlashCommandBuilder()
  .setName('wawptn-vote')
  .setDescription('Lancer une session de vote pour choisir un jeu')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  const group = await resolveGroup(interaction)
  if (!group) return

  try {
    const result = await backendApi<VoteStartResponse>(`/api/discord/vote/start`, {
      method: 'POST',
      discordUserId: interaction.user.id,
      body: { groupId: group.groupId },
    })

    const { embeds, components } = buildSessionCreatedEmbed(
      group.groupName,
      result.games,
      interaction.user.displayName,
      result.session.id,
    )

    // Send the session announcement as a public message in the channel
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({ embeds, components })
    }

    await interaction.editReply({
      content: `✅ Session de vote lancée dans **${group.groupName}** !`,
      components: [],
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ ${error instanceof Error ? error.message : 'Erreur lors du lancement du vote'}`,
      components: [],
    })
  }
}
