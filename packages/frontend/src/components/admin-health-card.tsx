import { useCallback, useEffect, useState } from 'react'
import { Activity, Database, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { m } from 'framer-motion'
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

  const tone = disabled
    ? { dotClass: 'bg-muted-foreground/40', textClass: 'text-muted-foreground/70', label: 'désactivé' }
    : open
      ? { dotClass: 'bg-destructive shadow-[0_0_10px_oklch(0.65_0.22_25_/_0.45)]', textClass: 'text-destructive', label: 'dégradé' }
      : { dotClass: 'bg-success shadow-[0_0_10px_oklch(0.723_0.191_142.5_/_0.45)]', textClass: 'text-success', label: 'opérationnel' }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`size-2.5 rounded-full shrink-0 ${tone.dotClass}`} aria-hidden="true" />
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

export function AdminHealthCard() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadHealth = useCallback(async () => {
    try {
      const data = await api.getAdminHealth()
      setSnapshot(data)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHealth()
    const interval = setInterval(() => { void loadHealth() }, 30 * 1000)
    return () => clearInterval(interval)
  }, [loadHealth])

  const handleRefresh = useCallback(() => {
    setLoading(true)
    void loadHealth()
  }, [loadHealth])

  return (
    <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="bg-card/60 backdrop-blur-sm border-white/[0.04]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="size-4" />
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
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
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
              <AlertTriangle className="size-4 shrink-0" />
              Impossible de récupérer l'état des intégrations.
            </div>
          ) : snapshot ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <AlertTriangle className="size-3" />
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
    </m.div>
  )
}
