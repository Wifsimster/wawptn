/**
 * Lightweight, privacy-first analytics for WAWPTN.
 *
 * Tracks adoption-funnel events (login → create group → invite → vote → play)
 * so we can measure where new users drop off. Intentionally minimal:
 *   - No third-party SDK, no cookies, no device fingerprinting
 *   - Events are posted to our own backend `/api/events` endpoint
 *   - User identity comes from the session cookie on the backend side — the
 *     client never sends user IDs or PII in event properties
 *   - Failures are swallowed: analytics must never break the app
 *
 * The backend currently writes events to its structured logger, which is
 * easy to ship to any destination later (Datadog, BigQuery, PostHog, etc.)
 * without touching the frontend.
 */

const ENDPOINT = '/api/events'

// Typed event names keep call sites honest and grep-able.
export type AnalyticsEvent =
  | 'user.login'
  | 'group.created'
  | 'group.joined'
  | 'group.join_failed'
  | 'group.create_failed'
  | 'group.discord_bound'
  | 'invite.generated'
  | 'invite.link_copied'
  | 'invite.shared'
  | 'sync.triggered'
  | 'vote.started'
  | 'vote.completed'
  | 'game.launched_in_steam'

type EventProps = Record<string, string | number | boolean | null | undefined>

function isDev(): boolean {
  try {
    return import.meta.env.DEV === true
  } catch {
    return false
  }
}

function send(event: AnalyticsEvent, properties?: EventProps): void {
  if (typeof window === 'undefined') return

  const payload = JSON.stringify({
    event,
    properties: properties ?? {},
    ts: Date.now(),
  })

  // Prefer sendBeacon so the request survives page unloads (important for
  // events like game.launched_in_steam that happen right before navigation).
  // Fall back to fetch with keepalive for Safari/Firefox quirks.
  try {
    if ('sendBeacon' in navigator) {
      const blob = new Blob([payload], { type: 'application/json' })
      const ok = navigator.sendBeacon(ENDPOINT, blob)
      if (ok) return
    }
    // Fallback
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* analytics must never break UX */
    })
  } catch {
    /* analytics must never break UX */
  }
}

/**
 * Track an adoption-funnel event. Fire-and-forget; never throws.
 *
 * Example:
 *   track('group.created', { memberCount: 1, fromOnboarding: true })
 */
export function track(event: AnalyticsEvent, properties?: EventProps): void {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.info('[analytics]', event, properties ?? {})
  }
  send(event, properties)
}
