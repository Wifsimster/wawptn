import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { api } from '@/lib/api'

interface PublicStats {
  users: number
  groups: number
  votesClosed: number
  votesClosed7d: number
}

const MIN_CREDIBLE_USERS = 25
const MIN_CREDIBLE_VOTES = 10

const numberFormatter = new Intl.NumberFormat('fr-FR')

function formatNumber(n: number): string {
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`.replace('.0k', 'k')
  return numberFormatter.format(n)
}

export function SocialProofStrip() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<PublicStats | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getPublicStats()
      .then((s) => { if (!cancelled) setStats(s) })
      .catch(() => { })
    return () => { cancelled = true }
  }, [])

  if (!stats) return null
  if (stats.users < MIN_CREDIBLE_USERS && stats.votesClosed < MIN_CREDIBLE_VOTES) return null

  return (
    <m.div
      className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
    >
      <Stat value={formatNumber(stats.users)} label={t('socialProof.users')} />
      <span aria-hidden="true" className="opacity-30">·</span>
      <Stat value={formatNumber(stats.groups)} label={t('socialProof.groups')} />
      <span aria-hidden="true" className="opacity-30">·</span>
      <Stat
        value={formatNumber(stats.votesClosed7d > 0 ? stats.votesClosed7d : stats.votesClosed)}
        label={stats.votesClosed7d > 0 ? t('socialProof.votes7d') : t('socialProof.votes')}
      />
    </m.div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <strong className="text-foreground font-heading font-bold tabular-nums text-sm">
        {value}
      </strong>
      <span>{label}</span>
    </span>
  )
}
