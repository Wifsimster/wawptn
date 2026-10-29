import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { backendApi } from '../lib/api.js'
import { buildLinkEmbed } from '../lib/embeds.js'

export const data = new SlashCommandBuilder()
  .setName('wawptn-link')
  .setDescription('Lier votre compte Discord à votre compte WAWPTN pour voter')

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true })

  try {
    const status = await backendApi<{ linked: boolean }>(`/api/discord/link/status`, {
      discordUserId: interaction.user.id,
    })

    if (status.linked) {
      await interaction.editReply({
        content: '✅ Votre compte Discord est déjà lié à votre compte WAWPTN !',
      })
      return
    }

    const { code, frontendUrl } = await backendApi<{ code: string; frontendUrl: string }>(`/api/discord/link`, {
      method: 'POST',
      body: { discordUserId: interaction.user.id, discordUsername: interaction.user.username },
    })

    const embeds = buildLinkEmbed(code, frontendUrl)
    await interaction.editReply({ embeds })
  } catch (error) {
    await interaction.editReply({
      content: `❌ Erreur : ${error instanceof Error ? error.message : 'Impossible de générer le code de liaison'}`,
    })
  }
}
