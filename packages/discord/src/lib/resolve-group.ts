import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { backendApi } from './api.js'

interface GroupOption {
  id: string
  name: string
}

interface GroupsResponse {
  groups: GroupOption[]
}

/**
 * Resolve which group to use for a command.
 * 1. If the channel is linked to a group via /wawptn-setup, use that group.
 * 2. Otherwise, fetch the user's groups and show a StringSelectMenu.
 *
 * Returns the groupId and groupName, or null if resolution failed
 * (error already replied to the interaction).
 */
export async function resolveGroup(
  interaction: ChatInputCommandInteraction,
  options?: { skipChannelLink?: boolean },
): Promise<{ groupId: string; groupName: string } | null> {
  // Check if Discord user is linked
  const status = await backendApi<{ linked: boolean }>(`/api/discord/link/status`, {
    discordUserId: interaction.user.id,
  })

  if (!status.linked) {
    await interaction.editReply({
      content: '🔗 Vous devez d\'abord lier votre compte ! Utilisez la commande `/wawptn-link`.',
    })
    return null
  }

  // Check if the channel is linked to a group (skip for setup command)
  if (!options?.skipChannelLink) {
    try {
      const gamesResult = await backendApi<{ groupName: string; games: unknown[] }>(
        `/api/discord/games?channelId=${interaction.channelId}`,
      )
      // Channel is linked — find the groupId
      const groupsResult = await backendApi<GroupsResponse>(`/api/discord/groups`, {
        discordUserId: interaction.user.id,
      })
      const linkedGroup = groupsResult.groups.find(g => g.name === gamesResult.groupName)
      if (linkedGroup) {
        return { groupId: linkedGroup.id, groupName: linkedGroup.name }
      }
    } catch {
      // Channel not linked — continue to group selection
    }
  }

  // Fetch user's groups
  const { groups } = await backendApi<GroupsResponse>(`/api/discord/groups`, {
    discordUserId: interaction.user.id,
  })

  if (groups.length === 0) {
    await interaction.editReply({
      content: '😕 Vous n\'êtes membre d\'aucun groupe WAWPTN.',
    })
    return null
  }

  // If only one group, auto-select
  if (groups.length === 1) {
    return { groupId: groups[0]!.id, groupName: groups[0]!.name }
  }

  // Show a StringSelectMenu for group selection
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select-group')
    .setPlaceholder('Choisissez un groupe...')
    .addOptions(
      groups.slice(0, 25).map(g => ({
        label: g.name,
        value: g.id,
      })),
    )

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

  const reply = await interaction.editReply({
    content: '🎮 Dans quel groupe ?',
    components: [row],
  })

  try {
    const menuInteraction = await reply.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 60_000,
    })

    const selectedGroupId = menuInteraction.values[0]!
    const selectedGroup = groups.find(g => g.id === selectedGroupId)!

    await menuInteraction.update({
      content: `✅ Groupe sélectionné : **${selectedGroup.name}**`,
      components: [],
    })

    return { groupId: selectedGroupId, groupName: selectedGroup.name }
  } catch {
    await interaction.editReply({
      content: '⏳ Temps écoulé. Relancez la commande.',
      components: [],
    })
    return null
  }
}
