import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const ALERT_COOLDOWN_MS = 60_000
let lastAlertAt = 0

export async function sendFatalAlert(title: string, detail: string): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) return

  const now = Date.now()
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return
  lastAlertAt = now

  try {
    const content = `🚨 **WAWPTN [${env.NODE_ENV}]** — ${title}\n\`\`\`\n${detail.slice(0, 1500)}\n\`\`\``
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch (err) {
    logger.error({ error: String(err) }, 'failed to deliver fatal alert')
  }
}
