import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { VoteResult } from '@wawptn/types'

export interface SessionGame {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
}

export function buildSessionCreatedEmbed(
  groupName: string,
  games: SessionGame[],
  creatorName: string,
  sessionId: string,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const gameList = games
    .slice(0, 25)
    .map((g, i) => `**${i + 1}.** ${g.gameName}`)
    .join('\n')

  const embed = new EmbedBuilder()
    .setTitle('🗳️ Vote lancé !')
    .setDescription(`**${creatorName}** a lancé un vote dans le groupe **${groupName}**.\n\nVotez 👍 ou 👎 sur chaque jeu. Faut se décider ce soir !\n\n${gameList}`)
    .setColor(0x5865F2)
    .setTimestamp()

  if (games[0]?.headerImageUrl) {
    embed.setThumbnail(games[0].headerImageUrl)
  }

  // Create vote buttons for each game (max 5 rows of 5 buttons = 25 games)
  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  for (let i = 0; i < Math.min(games.length, 25); i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    const chunk = games.slice(i, i + 5)

    for (const game of chunk) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote:${sessionId}:${game.steamAppId}:yes`)
          .setLabel(`👍 ${game.gameName.slice(0, 70)}`)
          .setStyle(ButtonStyle.Success),
      )
    }
    rows.push(row)
  }

  return { embeds: [embed], components: rows }
}

export function buildVoteClosedEmbed(
  result: VoteResult,
  groupName: string,
  options?: { personaName?: string; embedColor?: number },
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const color = options?.embedColor ?? 0x57F287

  const embed = new EmbedBuilder()
    .setTitle('🏆 Le groupe a choisi !')
    .setDescription(`Le groupe **${groupName}** a choisi :\n\n# ${result.gameName}`)
    .addFields(
      { name: 'Votes pour', value: `${result.yesCount}`, inline: true },
      { name: 'Votants', value: `${result.totalVoters}`, inline: true },
    )
    .setColor(color)
    .setTimestamp()

  if (options?.personaName) {
    embed.setFooter({ text: `WAWPTN — ${options.personaName}` })
  }

  if (result.headerImageUrl) {
    embed.setImage(result.headerImageUrl)
  }

  if (result.steamAppId) {
    embed.setURL(`https://store.steampowered.com/app/${result.steamAppId}`)
  }

  // Steam launch button (Link-style buttons work in bot messages)
  const components: ActionRowBuilder<ButtonBuilder>[] = []
  if (result.steamAppId) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Lancer sur Steam')
        .setStyle(ButtonStyle.Link)
        .setURL(`steam://run/${result.steamAppId}`)
        .setEmoji('🚀'),
    )
    components.push(row)
  }

  return { embeds: [embed], components }
}

export function buildRandomGameEmbed(
  game: { gameName: string; steamAppId: number; headerImageUrl: string | null },
  groupName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🎲 Au hasard !')
    .setDescription(`Le groupe **${groupName}** va jouer à :\n\n# ${game.gameName}`)
    .setColor(0xFEE75C)
    .setTimestamp()

  if (game.headerImageUrl) {
    embed.setImage(game.headerImageUrl)
  }

  if (game.steamAppId) {
    embed.setURL(`https://store.steampowered.com/app/${game.steamAppId}`)
  }

  return embed
}

export interface StatsResponse {
  groupName: string
  totalSessions: number
  launchers: Array<{ userId: string; displayName: string; count: number }>
  voters: Array<{ userId: string; displayName: string; count: number }>
  topGames: Array<{ steamAppId: number; gameName: string; wins: number }>
  streakLeaders: Array<{ userId: string; displayName: string; currentStreak: number; bestStreak: number }>
}

const RANK_MEDALS = ['🥇', '🥈', '🥉', '🏅', '🏅']

function formatRankedList<T>(rows: T[], render: (row: T, rank: number) => string): string {
  if (rows.length === 0) return '_Pas encore de données_'
  return rows.map((row, i) => `${RANK_MEDALS[i] ?? '•'} ${render(row, i + 1)}`).join('\n')
}

export function buildStatsEmbed(stats: StatsResponse): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Stats — ${stats.groupName}`)
    .setColor(0x5865F2)
    .setTimestamp()

  if (stats.totalSessions === 0) {
    embed.setDescription("Ce groupe n'a pas encore terminé de session de vote. Lancez-en une pour commencer le classement !")
    return embed
  }

  embed.setDescription(`**${stats.totalSessions}** session${stats.totalSessions > 1 ? 's' : ''} de vote terminée${stats.totalSessions > 1 ? 's' : ''}.`)

  embed.addFields(
    {
      name: '🚀 Top organisateurs',
      value: formatRankedList(stats.launchers, (l) => `**${l.displayName}** — ${l.count} session${l.count > 1 ? 's' : ''}`),
      inline: false,
    },
    {
      name: '🗳️ Top votants',
      value: formatRankedList(stats.voters, (v) => `**${v.displayName}** — ${v.count} vote${v.count > 1 ? 's' : ''}`),
      inline: false,
    },
    {
      name: '🏆 Jeux gagnants',
      value: formatRankedList(stats.topGames, (g) => `**${g.gameName}** — ${g.wins} victoire${g.wins > 1 ? 's' : ''}`),
      inline: false,
    },
  )

  if (stats.streakLeaders.length > 0) {
    embed.addFields({
      name: '🔥 Séries de participation',
      value: formatRankedList(stats.streakLeaders, (s) => {
        const cur = s.currentStreak > 0 ? ` (en cours : ${s.currentStreak})` : ''
        return `**${s.displayName}** — record ${s.bestStreak}${cur}`
      }),
      inline: false,
    })
  }

  return embed
}

export function buildLinkEmbed(linkCode: string, frontendUrl: string): EmbedBuilder[] {
  const embed = new EmbedBuilder()
    .setTitle('🔗 Lier votre compte WAWPTN')
    .setDescription(
      `Pour voter depuis Discord, vous devez lier votre compte WAWPTN.\n\n` +
      `1. Connectez-vous sur WAWPTN\n` +
      `2. Allez dans votre profil\n` +
      `3. Utilisez ce code de liaison : **\`${linkCode}\`**\n\n` +
      `Ou cliquez sur le lien ci-dessous :\n${frontendUrl}/discord/link?code=${linkCode}\n\n` +
      `⏳ Ce code expire dans 10 minutes.`
    )
    .setColor(0x5865F2)

  return [embed]
}
