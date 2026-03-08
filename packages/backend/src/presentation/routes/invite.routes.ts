import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { hashInviteToken } from '../../infrastructure/steam/steam-client.js'

const router = Router()

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

      const [{ count }] = await db('group_members')
        .where({ group_id: group.id })
        .count('* as count')
      memberCount = Number(count)
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
  const spaUrl = `${baseUrl}/#/join/${token}`
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
