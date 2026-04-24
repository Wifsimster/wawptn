import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { DiscordVoteSummary, DiscordVoteTally, VoteBreakdownEntry, VoteResult } from '@wawptn/types'

export interface SessionGame {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
}

/** Discord hard limit: 5 action rows × 5 buttons per row. We pack 2 games
 *  (4 buttons) per row, so 5 rows × 2 games = 10 games max per message.
 *  We cap early and display a "vote on the web" hint when truncation
 *  happens so Discord voters know the overflow exists. */
const MAX_GAMES_WITH_BUTTONS = 10

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

function tallyFor(summary: DiscordVoteSummary | undefined, steamAppId: number): DiscordVoteTally | undefined {
  return summary?.tallies.find((t) => t.steamAppId === steamAppId)
}

function renderGameLine(index: number, game: SessionGame, tally: DiscordVoteTally | undefined): string {
  const prefix = `**${index + 1}.** ${game.gameName}`
  if (!tally || (tally.yesCount === 0 && tally.noCount === 0)) return prefix
  return `${prefix} — 👍 ${tally.yesCount} · 👎 ${tally.noCount}`
}

function buildVoteRows(
  games: SessionGame[],
  sessionId: string,
  options: { disabled?: boolean } = {},
): ActionRowBuilder<ButtonBuilder>[] {
  const visible = games.slice(0, MAX_GAMES_WITH_BUTTONS)
  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  // Two buttons per game = 2 per row of width 5, so we fit 2 games per row.
  // Using label "👍 <name>" / "👎 <name>" lets voters tell games apart.
  for (let i = 0; i < visible.length; i += 2) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    const chunk = visible.slice(i, i + 2)
    for (const game of chunk) {
      const shortName = truncate(game.gameName, 18)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote:${sessionId}:${game.steamAppId}:yes`)
          .setLabel(`👍 ${shortName}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(!!options.disabled),
        new ButtonBuilder()
          .setCustomId(`vote:${sessionId}:${game.steamAppId}:no`)
          .setLabel(`👎 ${shortName}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!!options.disabled),
      )
    }
    rows.push(row)
  }
  return rows
}

interface BuildSessionEmbedParams {
  groupName: string
  creatorName: string
  sessionId: string
  games: SessionGame[]
  summary?: DiscordVoteSummary
}

/**
 * Builds the "vote opened" / "live update" message.
 * The same function is reused for every update — the only difference
 * between the initial post and a live edit is the `summary` payload.
 */
export function buildSessionEmbed(
  params: BuildSessionEmbedParams,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const { groupName, creatorName, sessionId, games, summary } = params

  const visibleCount = Math.min(games.length, MAX_GAMES_WITH_BUTTONS)
  const hiddenCount = games.length - visibleCount

  const gameList = games
    .slice(0, visibleCount)
    .map((g, i) => renderGameLine(i, g, tallyFor(summary, g.steamAppId)))
    .join('\n')

  const extraLine = hiddenCount > 0
    ? `\n\n_+${hiddenCount} autre${hiddenCount > 1 ? 's' : ''} jeu${hiddenCount > 1 ? 'x' : ''} — votez sur le site pour les voir tous._`
    : ''

  const progressLine = summary
    ? `\n\n🗳️ **${summary.voterCount}/${summary.totalParticipants}** ont voté`
    : ''

  const embed = new EmbedBuilder()
    .setTitle('🗳️ Vote lancé !')
    .setDescription(
      `**${creatorName}** a lancé un vote dans **${groupName}**.\n` +
      `Cliquez 👍 ou 👎 sur chaque jeu. Les votes du site et de Discord comptent ensemble.\n\n` +
      `${gameList}${extraLine}${progressLine}`,
    )
    .setColor(0x5865F2)
    .setTimestamp()

  if (games[0]?.headerImageUrl) {
    embed.setThumbnail(games[0].headerImageUrl)
  }

  const components = buildVoteRows(games, sessionId)
  return { embeds: [embed], components }
}

interface BuildSessionClosedEmbedParams {
  groupName: string
  sessionId: string
  games: SessionGame[]
  result: VoteResult
  summary?: DiscordVoteSummary
}

/**
 * Final state of the message once the session closes: winner highlighted,
 * all buttons disabled so nobody keeps clicking, and the per-game tallies
 * preserved so you can scroll back and see the full picture.
 */
export function buildSessionClosedEmbed(
  params: BuildSessionClosedEmbedParams,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const { groupName, sessionId, games, result, summary } = params

  const tallies = games
    .slice(0, MAX_GAMES_WITH_BUTTONS)
    .map((g, i) => renderGameLine(i, g, tallyFor(summary, g.steamAppId)))
    .join('\n')

  const winnerEmbed = new EmbedBuilder()
    .setTitle('🏆 Le groupe a choisi !')
    .setDescription(
      `Le groupe **${groupName}** a choisi :\n\n# ${result.gameName}\n\n` +
      `${result.yesCount} vote${result.yesCount > 1 ? 's' : ''} sur ${result.totalVoters} participant${result.totalVoters > 1 ? 's' : ''}.\n\n` +
      `**Résultats détaillés :**\n${tallies}`,
    )
    .setColor(0x57F287)
    .setTimestamp()

  if (result.headerImageUrl) {
    winnerEmbed.setImage(result.headerImageUrl)
  }
  if (result.steamAppId) {
    winnerEmbed.setURL(`https://store.steampowered.com/app/${result.steamAppId}`)
  }

  // Rebuild the vote rows in disabled state so the closed message still
  // shows every game that was in the vote, but nobody can click them.
  const rows = buildVoteRows(games, sessionId, { disabled: true })

  // Append the Steam launch link as a separate row if it fits (Discord
  // allows up to 5 action rows total).
  if (result.steamAppId && rows.length < 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Lancer sur Steam')
          .setStyle(ButtonStyle.Link)
          .setURL(`steam://run/${result.steamAppId}`)
          .setEmoji('🚀'),
      ),
    )
  }

  return { embeds: [winnerEmbed], components: rows }
}

// ── Legacy helpers kept for the existing setup/stats/random commands ───────

export function buildSessionCreatedEmbed(
  groupName: string,
  games: SessionGame[],
  creatorName: string,
  sessionId: string,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  return buildSessionEmbed({ groupName, creatorName, sessionId, games })
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

/**
 * Per-game breakdown of voters (names only) for the ephemeral "vote
 * recorded" reply. We render only the games the viewer has voted on —
 * that mirrors the web waiting-screen rule and avoids tilting voters
 * who haven't picked a game yet. If the viewer hasn't voted on any
 * game yet (shouldn't happen after a successful button press, but we
 * guard anyway), we return an empty string and the caller falls back
 * to the plain confirmation line.
 *
 * Discord description limit is 4096 chars; we cap each game's voter
 * list at a short count to keep the reply comfortably inside that.
 */
export function buildVoteBreakdownText(
  breakdown: VoteBreakdownEntry[],
  games: { steamAppId: number; gameName: string }[],
  myVotedAppIds: number[],
): string {
  const votedSet = new Set(myVotedAppIds)
  const byId = new Map(breakdown.map((b) => [b.steamAppId, b]))
  const gameName = new Map(games.map((g) => [g.steamAppId, g.gameName]))

  const MAX_NAMES = 10
  const lines: string[] = []

  for (const appId of myVotedAppIds) {
    const name = gameName.get(appId)
    if (!name) continue
    if (!votedSet.has(appId)) continue
    const entry = byId.get(appId)
    const yes = entry?.yesVoters ?? []
    const no = entry?.noVoters ?? []

    lines.push(`**${name}**`)

    if (yes.length + no.length === 0) {
      lines.push('_Personne n\'a encore voté._')
      continue
    }

    const renderNames = (voters: { displayName: string }[]): string => {
      const shown = voters.slice(0, MAX_NAMES).map((v) => v.displayName).join(', ')
      const overflow = voters.length > MAX_NAMES ? ` +${voters.length - MAX_NAMES}` : ''
      return `${shown}${overflow}`
    }

    if (yes.length > 0) lines.push(`👍 ${yes.length} — ${renderNames(yes)}`)
    if (no.length > 0) lines.push(`👎 ${no.length} — ${renderNames(no)}`)
  }

  return lines.join('\n')
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
