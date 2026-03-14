import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js'
import { backendApi } from '../lib/api.js'

export const data = new SlashCommandBuilder()
  .setName('wawptn-setup')
  .setDescription('Lier ce canal Discord à un groupe WAWPTN')
  .addStringOption(option =>
    option
      .setName('group-id')
      .setDescription('L\'ID du groupe WAWPTN à lier')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const groupId = interaction.options.getString('group-id', true)
  const channelId = interaction.channelId
  const guildId = interaction.guildId

  if (!guildId) {
    await interaction.reply({ content: '❌ Cette commande ne fonctionne que dans un serveur Discord.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  try {
    await backendApi(`/api/discord/setup`, {
      method: 'POST',
      body: {
        groupId,
        discordChannelId: channelId,
        discordGuildId: guildId,
      },
    })

    await interaction.editReply({
      content: `✅ Ce canal est maintenant lié au groupe WAWPTN !\n\nLes notifications de vote apparaîtront ici automatiquement.`,
    })
  } catch (error) {
    await interaction.editReply({
      content: `❌ Erreur : ${error instanceof Error ? error.message : 'Impossible de lier le canal'}`,
    })
  }
}
