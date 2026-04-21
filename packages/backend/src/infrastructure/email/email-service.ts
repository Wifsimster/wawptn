import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const emailLogger = logger.child({ module: 'email' })

/** Suffix applied to synthetic Steam-derived emails. Users with this suffix
 *  never actually registered their address, so we must not attempt delivery. */
const PLACEHOLDER_EMAIL_SUFFIX = '@steam.wawptn.app'

let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  })
  return transporter
}

export interface SendEmailParams {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Send a transactional email. No-ops (logs a warning) when SMTP is not
 * configured or the recipient is a placeholder Steam-derived address —
 * so development and Steam-only users degrade gracefully instead of erroring.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const { to, subject, text, html } = params

  if (!to || to.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX)) {
    emailLogger.debug({ to, subject }, 'skipping email: placeholder or missing recipient')
    return false
  }

  const t = getTransporter()
  if (!t) {
    emailLogger.warn({ to, subject }, 'SMTP not configured — email not sent')
    return false
  }

  try {
    await t.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    })
    emailLogger.info({ to, subject }, 'email sent')
    return true
  } catch (error) {
    emailLogger.error({ error: String(error), to, subject }, 'failed to send email')
    return false
  }
}
