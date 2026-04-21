import { db } from '../database/connection.js'
import { logger } from '../logger/logger.js'
import { env } from '../../config/env.js'
import { createNotification } from './notification-service.js'
import { sendEmail } from '../email/email-service.js'

const premiumLogger = logger.child({ module: 'premium-notifications' })

interface NotifyPremiumChangeParams {
  targetUserId: string
  granted: boolean
  actorUserId?: string
}

/**
 * Fan-out notifications for an admin-driven premium change: an in-app
 * notification (always) plus an email (when the user has a real address
 * and SMTP is configured). UI language is French to match the rest of
 * the product. Failures are swallowed — the caller has already committed
 * the premium change to the DB and shouldn't fail over a missed notice.
 */
export async function notifyPremiumChange(params: NotifyPremiumChangeParams): Promise<void> {
  const { targetUserId, granted, actorUserId } = params

  const title = granted
    ? 'Accès premium activé'
    : 'Accès premium retiré'

  const body = granted
    ? 'Un administrateur vient de vous offrir un accès premium. Profitez de toutes les fonctionnalités !'
    : 'Votre accès premium a été retiré par un administrateur.'

  try {
    await createNotification({
      type: granted ? 'premium_granted' : 'premium_revoked',
      title,
      body,
      createdBy: actorUserId,
      metadata: { actionUrl: '/account' },
      recipientUserIds: [targetUserId],
      // Keep the banner around long enough that the user sees it even if
      // they weren't online when the admin toggled the flag.
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
  } catch (error) {
    premiumLogger.warn(
      { error: String(error), targetUserId, granted },
      'in-app premium notification failed',
    )
  }

  try {
    const user = await db('users')
      .where({ id: targetUserId })
      .select('email', 'display_name')
      .first()
    if (!user?.email) return

    const displayName = user.display_name || 'joueur'
    const accountUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/account`

    const text = granted
      ? `Bonjour ${displayName},\n\n`
        + `Bonne nouvelle : un administrateur vient de vous offrir un accès premium sur WAWPTN. `
        + `Vous bénéficiez désormais de toutes les fonctionnalités premium.\n\n`
        + `Accédez à votre compte : ${accountUrl}\n\n`
        + `À très vite,\nL'équipe WAWPTN`
      : `Bonjour ${displayName},\n\n`
        + `Nous vous informons que votre accès premium a été retiré par un administrateur. `
        + `Vous pouvez continuer à utiliser WAWPTN avec un compte standard ou souscrire à un abonnement à tout moment.\n\n`
        + `Accédez à votre compte : ${accountUrl}\n\n`
        + `À très vite,\nL'équipe WAWPTN`

    await sendEmail({
      to: user.email,
      subject: title,
      text,
    })
  } catch (error) {
    premiumLogger.warn(
      { error: String(error), targetUserId, granted },
      'premium email notification failed',
    )
  }
}
