export interface WebhookMetrics {
  totalReceived: number
  signatureFailures: number
  duplicates: number
  successes: number
  processingFailures: number
  byType: Record<string, { successes: number; failures: number }>
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

export function _resetWebhookMetrics(): void {
  metrics.totalReceived = 0
  metrics.signatureFailures = 0
  metrics.duplicates = 0
  metrics.successes = 0
  metrics.processingFailures = 0
  metrics.byType = {}
  metrics.lastSuccessAt = null
}
