import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { env } from '../../config/env.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

/**
 * Public share page for a closed voting session result.
 * Serves HTML with Open Graph + Twitter Card meta tags so that social
 * crawlers (Twitter, Discord, Facebook, Slack) render a rich preview.
 * Human visitors are redirected to the SPA via <meta http-equiv="refresh">.
 */
router.get('/vote/:sessionId', async (req: Request, res: Response) => {
  const sessionId = String(req.params['sessionId'])

  try {
    const session = await db('voting_sessions')
      .where({ id: sessionId, status: 'closed' })
      .whereNotNull('winning_game_name')
      .first()

    if (!session) {
      res.status(404).type('html').send(renderNotFound())
      return
    }

    const group = await db('groups')
      .where({ id: session.group_id })
      .first()

    if (!group) {
      res.status(404).type('html').send(renderNotFound())
      return
    }

    // Compute vote stats for the description text
    const yesCountRow = await db('votes')
      .where({ session_id: sessionId, steam_app_id: session.winning_game_app_id, vote: true })
      .count('* as count')
      .first()
    const yesCount = Number(yesCountRow?.count || 0)

    const participantCountRow = await db('voting_session_participants')
      .where({ session_id: sessionId })
      .count('* as count')
      .first()
    let totalVoters = Number(participantCountRow?.count || 0)
    if (totalVoters === 0) {
      const memberCountRow = await db('group_members')
        .where({ group_id: session.group_id })
        .count('* as count')
        .first()
      totalVoters = Number(memberCountRow?.count || 0)
    }

    const baseUrl = env.API_URL
    const imageUrl = `${baseUrl}/api/og/vote/${sessionId}.png`
    const shareUrl = `${baseUrl}/share/vote/${sessionId}`
    const spaUrl = `/groups/${session.group_id}/vote`

    const gameName = session.winning_game_name as string
    const groupName = group.name as string

    const title = `${gameName} a gagné dans ${groupName} !`
    const description = `${yesCount}/${totalVoters} membres ont voté pour ce jeu sur WAWPTN.`

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:site_name" content="WAWPTN">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">

  <!-- Theme color for Discord embed sidebar -->
  <meta name="theme-color" content="#6366f1">

  <!-- Redirect human visitors to the SPA -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(spaUrl)}">
</head>
<body>
  <p>Redirection vers <a href="${escapeHtml(spaUrl)}">WAWPTN</a>...</p>
</body>
</html>`

    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (error) {
    logger.error({ error: String(error), sessionId }, 'share vote page failed')
    res.status(500).type('html').send(renderNotFound())
  }
})

function renderNotFound(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>WAWPTN — Résultat introuvable</title>
  <meta property="og:title" content="WAWPTN — On joue à quoi ce soir ?">
  <meta property="og:description" content="Connecte-toi avec Steam, rejoins un groupe et votez pour le jeu de ce soir !">
  <meta name="twitter:card" content="summary">
  <meta http-equiv="refresh" content="0;url=/">
</head>
<body>
  <p>Résultat introuvable. <a href="/">Retour à l'accueil</a>.</p>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export { router as shareRoutes }
