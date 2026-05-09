/**
 * In-memory webhook metrics, surfaced via /admin/subscription-health.
 *
 * Per-replica counters (no Redis for MVP — see CLAUDE.md). They reset on
 * process restart, which is acceptable for the things we want to detect:
 *
 *   - signatureFailures > 0 sustained over multiple polls = secret rotated
 *     and we missed it, or someone is probing the endpoint
 *   - processingFailures clustered on one event_type = handler bug or
 *     Stripe API shape change
 *   - duplicates dwarfing successes = atomic dedup-and-claim is doing its
 *     job (or Stripe's at-least-once delivery is being chatty)
 *
 * Multi-replica deployments: the /subscription-health endpoint reads only
 * its own replica's counters. To get a fleet view, hit each replica's
 * health endpoint individually — fine for the on-demand-ops use case
 * we're optimising for. If we move to a managed metrics backend later,
 * replace these counters with Prometheus/StatsD without changing the
 * call sites.
 */
export interface WebhookMetrics {
  /** Total events delivered to the webhook (claimed + duplicates). */
  totalReceived: number
  /** Events that failed signature verification — alarm if non-zero for
   *  a sustained period. */
  signatureFailures: number
  /** Events that the dedup-and-claim treated as duplicates (already
   *  successfully processed by another delivery). */
  duplicates: number
  /** Events the handler completed and committed. */
  successes: number
  /** Events that failed (either transient or permanent) at handler time. */
  processingFailures: number
  /** Per-event-type success / failure breakdown. */
  byType: Record<string, { successes: number; failures: number }>
  /** Wall-clock of the most recent successful event handle, for alerting
   *  on "the webhook hasn't seen anything in N hours". */
  lastSuccessAt: Date | null
}

const metrics: WebhookMetrics = {
  totalReceived: 0,
  signatureFailures: 0,
  duplicates: 0,
  successes: 0,
  processingFailures: 0,
  byType: {},
  lastSuccessAt: null,
}

function bumpType(eventType: string, key: 'successes' | 'failures'): void {
  const bucket = metrics.byType[eventType] ?? { successes: 0, failures: 0 }
  bucket[key] += 1
  metrics.byType[eventType] = bucket
}

export function incrementWebhookReceived(): void {
  metrics.totalReceived += 1
}

export function incrementSignatureFailure(): void {
  metrics.signatureFailures += 1
}

export function incrementWebhookDuplicate(): void {
  metrics.duplicates += 1
}

export function incrementWebhookSuccess(eventType: string): void {
  metrics.successes += 1
  metrics.lastSuccessAt = new Date()
  bumpType(eventType, 'successes')
}

export function incrementWebhookFailure(eventType: string): void {
  metrics.processingFailures += 1
  bumpType(eventType, 'failures')
}

export function getWebhookMetrics(): WebhookMetrics {
  return {
    ...metrics,
    byType: { ...metrics.byType },
  }
}

/** Test helper — reset counters between tests. Not exported in the
 *  module's public surface for production callers. */
export function _resetWebhookMetrics(): void {
  metrics.totalReceived = 0
  metrics.signatureFailures = 0
  metrics.duplicates = 0
  metrics.successes = 0
  metrics.processingFailures = 0
  metrics.byType = {}
  metrics.lastSuccessAt = null
}
