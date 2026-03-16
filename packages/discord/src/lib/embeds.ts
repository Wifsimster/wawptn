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
    .setTitle('⚔️ Alerte frag — vote lancé !')
    .setDescription(`**${creatorName}** a lancé un vote dans le groupe **${groupName}**.\n\nVotez 👍 ou 👎 sur chaque jeu. Pas de camping, on tranche ce soir !\n\n${gameList}`)
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

export function buildVoteClosedEmbed(result: VoteResult, groupName: string): EmbedBuilder[] {
  const embed = new EmbedBuilder()
    .setTitle('🏆 GG — le clan a tranché !')
    .setDescription(`Le groupe **${groupName}** a choisi :\n\n# ${result.gameName}`)
    .addFields(
      { name: 'Votes pour', value: `${result.yesCount}`, inline: true },
      { name: 'Votants', value: `${result.totalVoters}`, inline: true },
    )
    .setColor(0x57F287)
    .setTimestamp()

  if (result.headerImageUrl) {
    embed.setImage(result.headerImageUrl)
  }

  if (result.steamAppId) {
    embed.setURL(`https://store.steampowered.com/app/${result.steamAppId}`)
  }

  return [embed]
}

export function buildRandomGameEmbed(
  game: { gameName: string; steamAppId: number; headerImageUrl: string | null },
  groupName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🎲 Random pick — la RNG a parlé !')
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
