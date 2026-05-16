import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

/**
 * Best-effort fatal-error alerter. When ALERT_WEBHOOK_URL is configured
 * (a Discord-webhook-format URL), fatal conditions — uncaught exceptions,
 * unhandled rejections, a failed startup, a database outage — are POSTed
 * there so a 2am failure pages someone instead of dying silently. No-op
 * when unconfigured.
 *
 * This is the dependency-free alerting baseline. A full error-tracking
 * service (Sentry et al.) is still worth wiring for grouping and metrics.
 */

// Crash loops can fire the same fatal handler repeatedly; throttle so the
// webhook isn't hammered. The first alert in a window always goes through.
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
