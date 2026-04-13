import { useEffect, useState } from 'react'
import { Activity, Database, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

interface IntegrationHealth {
  state: 'open' | 'closed'
  consecutiveFailures: number
  circuitOpenUntil: string | null
  cacheSize: number
  enabled?: boolean
}

interface HealthSnapshot {
  timestamp: string
  database: { status: 'up' | 'down'; latencyMs: number | null }
  integrations: {
    steam: IntegrationHealth
    epic: IntegrationHealth
    gog: IntegrationHealth
  }
}

interface IntegrationRowProps {
  label: string
  health: IntegrationHealth
}

function IntegrationRow({ label, health }: IntegrationRowProps) {
  const disabled = health.enabled === false
  const open = health.state === 'open'

  // Three visual states:
  //   disabled — integration is not configured, render muted
  //   open     — circuit breaker tripped, render error
  //   closed   — healthy, render success
  const tone = disabled
    ? { dotClass: 'bg-muted-foreground/40', textClass: 'text-muted-foreground/70', label: 'désactivé' }
    : open
      ? { dotClass: 'bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.45)]', textClass: 'text-destructive', label: 'dégradé' }
      : { dotClass: 'bg-success shadow-[0_0_10px_rgba(74,222,128,0.45)]', textClass: 'text-success', label: 'opérationnel' }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tone.dotClass}`} aria-hidden="true" />
        <span className="text-sm font-medium truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        {!disabled && (
          <span className="font-mono">cache: {health.cacheSize}</span>
        )}
        {!disabled && health.consecutiveFailures > 0 && (
          <span className="font-mono">{health.consecutiveFailures} échec(s)</span>
        )}
        <span className={`font-medium ${tone.textClass}`}>{tone.label}</span>
      </div>
    </div>
  )
}

/**
 * Admin health card consuming GET /api/admin/health. Shows database
 * connectivity and the circuit breaker state of each external integration
 * so admins can spot a degraded bot without tailing the logs.
 *
 * Auto-refreshes every 30 seconds while the card is mounted; a manual
 * refresh button is also provided. Failures are non-fatal — the card just
 * renders an error state and keeps trying on the next tick.
 */
export function AdminHealthCard() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchHealth = async () => {
      try {
        const data = await api.getAdminHealth()
        if (cancelled) return
        setSnapshot(data)
        setError(false)
      } catch {
        if (cancelled) return
        setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 30 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const handleRefresh = async () => {
    setLoading(true)
    try {
      const data = await api.getAdminHealth()
      setSnapshot(data)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="bg-card/60 backdrop-blur-sm border-white/[0.04]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Santé des intégrations
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Rafraîchir"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !snapshot ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 rounded-md" />)}
            </div>
          ) : error && !snapshot ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Impossible de récupérer l'état des intégrations.
            </div>
          ) : snapshot ? (
            <>
              {/* Database row uses a slightly different shape than the
                  integrations because it carries latency, not a circuit
                  breaker state. */}
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">Base de données</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  {snapshot.database.latencyMs !== null && (
                    <span className="font-mono">{snapshot.database.latencyMs} ms</span>
                  )}
                  <span
                    className={`flex items-center gap-1 font-medium ${
                      snapshot.database.status === 'up' ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {snapshot.database.status === 'up' ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {snapshot.database.status === 'up' ? 'opérationnel' : 'indisponible'}
                  </span>
                </div>
              </div>

              <IntegrationRow label="Steam" health={snapshot.integrations.steam} />
              <IntegrationRow label="Epic Games" health={snapshot.integrations.epic} />
              <IntegrationRow label="GOG" health={snapshot.integrations.gog} />

              <p className="text-[10px] text-muted-foreground/60 font-mono pt-1">
                Mis à jour : {new Date(snapshot.timestamp).toLocaleTimeString('fr-FR')}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  )
}
