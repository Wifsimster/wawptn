import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { getGuildSettings, updateGuildSettings } from '../lib/api.js'

// Matches a 5-field cron expression loosely enough to reject obvious
// nonsense while still allowing ranges, lists and step values. The
// backend does its own cron validation; this is only the first line of
// defence so we can give the user a friendly error before the round-trip.
const CRON_PATTERN = /^[-*/,0-9\s]+$/

export const data = new SlashCommandBuilder()
  .setName('wawptn-config')
  .setDescription('Configure les paramètres du bot pour ce serveur')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub.setName('show').setDescription('Affiche la configuration actuelle de ce serveur'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Modifie un paramètre du bot pour ce serveur')
      .addStringOption((opt) =>
        opt
          .setName('champ')
          .setDescription('Paramètre à modifier')
          .setRequired(true)
          .addChoices(
            { name: 'Rappel du vendredi (cron)', value: 'friday_schedule' },
            { name: 'Rappel du milieu de semaine (cron)', value: 'wednesday_schedule' },
            { name: 'Fuseau horaire (IANA)', value: 'schedule_timezone' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('valeur')
          .setDescription('Nouvelle valeur (ex: "0 21 * * 5", "Europe/Paris")')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription("Réinitialise un paramètre à sa valeur globale")
      .addStringOption((opt) =>
        opt
          .setName('champ')
          .setDescription('Paramètre à réinitialiser')
          .setRequired(true)
          .addChoices(
            { name: 'Rappel du vendredi', value: 'friday_schedule' },
            { name: 'Rappel du milieu de semaine', value: 'wednesday_schedule' },
            { name: 'Fuseau horaire', value: 'schedule_timezone' },
          ),
      ),
  )

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur Discord.',
      ephemeral: true,
    })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const sub = interaction.options.getSubcommand()

  try {
    if (sub === 'show') {
      const settings = await getGuildSettings(interaction.guildId)
      const mark = (active: boolean) => (active ? '⚙️' : '🌐')
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Configuration WAWPTN')
        .setDescription(
          `Paramètres pour **${interaction.guild?.name ?? 'ce serveur'}**.\n` +
            '⚙️ = spécifique au serveur · 🌐 = valeur globale héritée',
        )
        .setColor(0x5865f2)
        .addFields(
          {
            name: `${mark(settings.overrides.friday_schedule)} Rappel du vendredi`,
            value: `\`${settings.friday_schedule}\``,
            inline: false,
          },
          {
            name: `${mark(settings.overrides.wednesday_schedule)} Rappel du milieu de semaine`,
            value: `\`${settings.wednesday_schedule}\``,
            inline: false,
          },
          {
            name: `${mark(settings.overrides.schedule_timezone)} Fuseau horaire`,
            value: `\`${settings.schedule_timezone}\``,
            inline: false,
          },
        )

      if (settings.updatedAt) {
        embed.setFooter({ text: `Dernière mise à jour : ${new Date(settings.updatedAt).toLocaleString('fr-FR')}` })
      }

      await interaction.editReply({ embeds: [embed] })
      return
    }

    if (sub === 'set') {
      const field = interaction.options.getString('champ', true) as
        | 'friday_schedule'
        | 'wednesday_schedule'
        | 'schedule_timezone'
      const value = interaction.options.getString('valeur', true).trim()

      if (field === 'schedule_timezone') {
        if (value.length === 0 || value.length > 64) {
          await interaction.editReply({ content: '❌ Le fuseau horaire doit faire entre 1 et 64 caractères.' })
          return
        }
      } else if (!CRON_PATTERN.test(value)) {
        await interaction.editReply({
          content: "❌ L'expression cron est invalide. Exemple : `0 21 * * 5` (vendredi 21h).",
        })
        return
      }

      await updateGuildSettings(interaction.guildId, {
        [field]: value,
        updatedByDiscordId: interaction.user.id,
      })

      await interaction.editReply({ content: `✅ ${field} mis à jour : \`${value}\`` })
      return
    }

    if (sub === 'reset') {
      const field = interaction.options.getString('champ', true) as
        | 'friday_schedule'
        | 'wednesday_schedule'
        | 'schedule_timezone'

      await updateGuildSettings(interaction.guildId, {
        [field]: null,
        updatedByDiscordId: interaction.user.id,
      })

      await interaction.editReply({ content: `♻️ ${field} réinitialisé à la valeur globale.` })
      return
    }

    await interaction.editReply({ content: '❌ Sous-commande inconnue.' })
  } catch (error) {
    await interaction.editReply({
      content: `❌ ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
    })
  }
}
