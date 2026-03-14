import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js'
import { backendApi } from '../lib/api.js'
import { resolveGroup } from '../lib/resolve-group.js'

export const data = new SlashCommandBuilder()
  .setName('wawptn-setup')
  .setDescription('Lier ce canal Discord à un groupe WAWPTN')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId

  if (!guildId) {
    await interaction.reply({ content: '❌ Cette commande ne fonctionne que dans un serveur Discord.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const group = await resolveGroup(interaction, { skipChannelLink: true })
  if (!group) return

  try {
    await backendApi(`/api/discord/setup`, {
      method: 'POST',
      body: {
        groupId: group.groupId,
        discordChannelId: interaction.channelId,
        discordGuildId: guildId,
      },
    })

    await interaction.editReply({
      content: `✅ Ce canal est maintenant lié au groupe **${group.groupName}** !\n\nLes notifications de vote apparaîtront ici automatiquement.`,
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ Erreur : ${error instanceof Error ? error.message : 'Impossible de lier le canal'}`,
    })
  }
}
