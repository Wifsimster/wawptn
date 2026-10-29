const ENDPOINT = '/api/events'

export type AnalyticsEvent =
  | 'user.login'
  | 'group.created'
  | 'group.joined'
  | 'group.join_failed'
  | 'group.create_failed'
  | 'group.hero_start_vote'
  | 'group.hero_join_vote'
  | 'group.row_join_vote'
  | 'invite.generated'
  | 'invite.link_copied'
  | 'invite.shared'
  | 'sync.triggered'
  | 'vote.started'
  | 'vote.completed'
  | 'game.launched_in_steam'
  | 'premium.gate_shown'
  | 'premium.upgrade_clicked'
  | 'premium.cadence_selected'
  | 'premium.checkout_started'
  | 'premium.checkout_completed'

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

  try {
    if ('sendBeacon' in navigator) {
      const blob = new Blob([payload], { type: 'application/json' })
      const ok = navigator.sendBeacon(ENDPOINT, blob)
      if (ok) return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
    })
  } catch {
  }
}

export function track(event: AnalyticsEvent, properties?: EventProps): void {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.info('[analytics]', event, properties ?? {})
  }
  send(event, properties)
}
