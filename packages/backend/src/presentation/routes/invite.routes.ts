import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { hashInviteToken } from '../../infrastructure/steam/steam-client.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

/**
 * Public JSON invite preview — returns group info, member avatars,
 * top 3 most-voted games, and the most recent winning game.
 * No authentication required so the JoinPage can show a rich preview.
 */
router.get('/:token/preview', async (req: Request, res: Response) => {
  const token = String(req.params['token'])

  try {
    const hash = hashInviteToken(token)
    const group = await db('groups')
      .where({ invite_token_hash: hash })
      .where('invite_expires_at', '>', new Date())
      .first()

    if (!group || group.invite_use_count >= group.invite_max_uses) {
      res.json({
        isValid: false,
        groupName: '',
        memberCount: 0,
        memberAvatars: [],
        topGames: [],
        recentWinner: null,
      })
      return
    }

    // Member count
    const countResult = await db('group_members')
      .where({ group_id: group.id })
      .count('* as count')
      .first()
    const memberCount = Number(countResult?.count || 0)

    // Member avatars (up to 5)
    const members = await db('group_members')
      .join('users', 'users.id', 'group_members.user_id')
      .where({ group_id: group.id })
      .select('users.avatar_url')
      .orderBy('group_members.joined_at', 'asc')
      .limit(5) as { avatar_url: string | null }[]
    const memberAvatars = members.map(m => m.avatar_url).filter(Boolean) as string[]

    // Top 3 most voted-for games (by positive vote count across closed sessions)
    const topGames = await db('votes')
      .join('voting_sessions', 'voting_sessions.id', 'votes.session_id')
      .join('voting_session_games', function () {
        this.on('voting_session_games.session_id', '=', 'votes.session_id')
            .andOn('voting_session_games.steam_app_id', '=', 'votes.steam_app_id')
      })
      .where({ 'voting_sessions.group_id': group.id, 'voting_sessions.status': 'closed', 'votes.vote': true })
      .select(
        'voting_session_games.game_name as gameName',
        'voting_session_games.header_image_url as headerImageUrl',
      )
      .count('* as voteCount')
      .groupBy('voting_session_games.game_name', 'voting_session_games.header_image_url')
      .orderBy('voteCount', 'desc')
      .limit(3) as unknown as { gameName: string; headerImageUrl: string | null }[]

    // Recent winner: last closed session with a winning game
    const lastWinner = await db('voting_sessions')
      .where({ group_id: group.id, status: 'closed' })
      .whereNotNull('winning_game_name')
      .select('winning_game_name as gameName', 'winning_game_app_id as steamAppId')
      .orderBy('closed_at', 'desc')
      .first() as { gameName: string; steamAppId: number } | undefined

    let recentWinner: { gameName: string; headerImageUrl: string | null } | null = null
    if (lastWinner) {
      // Get header image from voting_session_games
      const gameRow = await db('voting_session_games')
        .join('voting_sessions', 'voting_sessions.id', 'voting_session_games.session_id')
        .where({ 'voting_sessions.group_id': group.id })
        .where('voting_session_games.steam_app_id', lastWinner.steamAppId)
        .select('voting_session_games.header_image_url')
        .first() as { header_image_url: string | null } | undefined

      recentWinner = {
        gameName: lastWinner.gameName,
        headerImageUrl: gameRow?.header_image_url ?? null,
      }
    }

    res.json({
      isValid: true,
      groupName: group.name,
      memberCount,
      memberAvatars,
      topGames: topGames.map(g => ({ gameName: g.gameName, headerImageUrl: g.headerImageUrl })),
      recentWinner,
    })
  } catch (error) {
    logger.error({ error: String(error), token }, 'invite preview failed')
    res.json({
      isValid: false,
      groupName: '',
      memberCount: 0,
      memberAvatars: [],
      topGames: [],
      recentWinner: null,
    })
  }
})

/**
 * Public invite preview route for Discord/social media rich embeds.
 * Returns minimal HTML with Open Graph meta tags, then redirects to the SPA.
 * No authentication required — crawlers (Discord, Slack, Twitter) cannot authenticate.
 */
router.get('/:token', async (req: Request, res: Response) => {
  const token = String(req.params['token'])

  let groupName = ''
  let memberCount = 0
  let isValid = false

  try {
    const hash = hashInviteToken(token)
    const group = await db('groups')
      .where({ invite_token_hash: hash })
      .where('invite_expires_at', '>', new Date())
      .first()

    if (group && group.invite_use_count < group.invite_max_uses) {
      isValid = true
      groupName = group.name

      const result = await db('group_members')
        .where({ group_id: group.id })
        .count('* as count')
        .first()
      memberCount = Number(result?.count || 0)
    }
  } catch {
    // If DB lookup fails, serve generic preview
  }

  const ogTitle = isValid
    ? `Rejoins ${groupName} sur WAWPTN !`
    : 'WAWPTN — On joue à quoi ce soir ?'

  const ogDescription = isValid
    ? `${memberCount} membre${memberCount > 1 ? 's' : ''} — Connecte-toi avec Steam et vote pour le jeu de ce soir !`
    : 'Connecte-toi avec Steam, rejoins un groupe et votez pour le jeu de ce soir !'

  const baseUrl = `${req.protocol}://${req.get('host')}`
  const spaUrl = `${baseUrl}/join/${token}`
  const ogImageUrl = `${baseUrl}/og-image.png`

  // Minimal HTML with OG tags for crawlers + meta refresh redirect for humans
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ogTitle)}</title>

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:url" content="${baseUrl}/invite/${token}">
  <meta property="og:site_name" content="WAWPTN">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="twitter:image" content="${ogImageUrl}">

  <!-- Theme color for Discord embed sidebar -->
  <meta name="theme-color" content="#6366f1">

  <!-- Redirect to SPA -->
  <meta http-equiv="refresh" content="0;url=${spaUrl}">
</head>
<body>
  <p>Redirection en cours... <a href="${spaUrl}">Cliquer ici</a> si rien ne se passe.</p>
</body>
</html>`

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export { router as inviteRoutes }
