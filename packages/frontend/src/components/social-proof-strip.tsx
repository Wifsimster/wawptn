import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'

interface PublicStats {
  users: number
  groups: number
  votesClosed: number
  votesClosed7d: number
}

/**
 * Landing-page social-proof strip — addresses B1 from the conversion
 * review (no-social-proof was flagged as the single biggest conversion
 * blocker on the marketing surface).
 *
 * Fetches `/api/stats/public` (5-min server cache) and renders three
 * compact tiles. Suppressed entirely when the numbers are below a
 * minimum credible threshold — early-stage product, an honest "1 vote
 * closed" looks worse than no proof at all.
 *
 * Graceful failure: errors swallow silently and the strip just doesn't
 * render. Falls back to a fade-in animation so the LCP isn't blocked
 * by the network request.
 */
const MIN_CREDIBLE_USERS = 25
const MIN_CREDIBLE_VOTES = 10

function formatNumber(n: number, locale = 'fr-FR'): string {
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`.replace('.0k', 'k')
  return new Intl.NumberFormat(locale).format(n)
}

export function SocialProofStrip() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<PublicStats | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getPublicStats()
      .then((s) => { if (!cancelled) setStats(s) })
      .catch(() => { /* swallow — never block the hero */ })
    return () => { cancelled = true }
  }, [])

  if (!stats) return null
  if (stats.users < MIN_CREDIBLE_USERS && stats.votesClosed < MIN_CREDIBLE_VOTES) return null

  return (
    <motion.div
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
    </motion.div>
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
