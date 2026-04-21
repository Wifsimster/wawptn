import { Resend } from 'resend'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const emailLogger = logger.child({ module: 'email' })

/** Suffix applied to synthetic Steam-derived emails. Users with this suffix
 *  never actually registered their address, so we must not attempt delivery. */
const PLACEHOLDER_EMAIL_SUFFIX = '@steam.wawptn.app'

let client: Resend | null = null

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null
  if (client) return client
  client = new Resend(env.RESEND_API_KEY)
  return client
}

export interface SendEmailParams {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Send a transactional email through Resend. No-ops (logs a warning) when
 * RESEND_API_KEY is not configured or the recipient is a placeholder
 * Steam-derived address — so development and Steam-only users degrade
 * gracefully instead of erroring.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const { to, subject, text, html } = params

  if (!to || to.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX)) {
    emailLogger.debug({ to, subject }, 'skipping email: placeholder or missing recipient')
    return false
  }

  const resend = getClient()
  if (!resend) {
    emailLogger.warn({ to, subject }, 'Resend not configured — email not sent')
    return false
  }

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  })

  if (error) {
    emailLogger.error({ error: String(error), to, subject }, 'Resend rejected email')
    return false
  }

  emailLogger.info({ to, subject, messageId: data?.id }, 'email sent')
  return true
}
