import { Resend } from 'resend'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const emailLogger = logger.child({ module: 'email' })

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
