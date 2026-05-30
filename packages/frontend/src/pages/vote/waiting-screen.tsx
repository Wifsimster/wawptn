import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CountdownTimer } from '@/components/countdown-timer'
import { CelebrationParticles } from '@/components/celebration-particles'
import type { SessionMeta } from './types'

interface WaitingScreenProps {
  session: SessionMeta | null
  selectedCount: number
  voterCount: number
  totalMembers: number
  participantIds: string[]
  votedUserIds: Set<string>
  canClose: boolean | null
  closing: boolean
  onClose: () => void
  onBack: () => void
}

export function WaitingScreen({
  session,
  selectedCount,
  voterCount,
  totalMembers,
  participantIds,
  votedUserIds,
  canClose,
  closing,
  onClose,
  onBack,
}: WaitingScreenProps) {
  const { t } = useTranslation()
  // Snapshot "now" once at mount rather than reading the impure Date.now()
  // during render. The CountdownTimer below handles the live ticking; this
  // only decides whether the scheduled start is still in the future.
  const [mountedAt] = useState(() => Date.now())
  const scheduledDate = session?.scheduledAt ? new Date(session.scheduledAt) : null
  const isScheduledSession = scheduledDate !== null && scheduledDate.getTime() > mountedAt

  return (
    <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center px-3 sm:px-4 py-4">
      <Check className="size-16 text-success mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-heading font-bold mb-2">{t('vote.submitted')}</h1>

      {isScheduledSession && (
        <div className="mb-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">{t('vote.scheduledCountdown')}</p>
          <CountdownTimer targetDate={scheduledDate} />
          <p className="text-xs text-muted-foreground mt-3">
            {t('vote.scheduledDate', { date: scheduledDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}
          </p>
        </div>
      )}

      <p className="text-muted-foreground mb-2">
        {t('vote.selectedCount', { count: selectedCount })}
      </p>
      <output aria-live="polite" className="block text-muted-foreground mb-6">
        {t('vote.waiting', { done: voterCount, total: totalMembers })}
      </output>

      <div className="relative w-48 mb-3">
        {/* Burst a fresh set of particles each time voterCount increments —
            the changing key remounts the component so the lazy initializer
            regenerates random positions and the animation replays. */}
        {voterCount > 0 && <CelebrationParticles key={voterCount} count={10} />}
        <Progress value={voterCount} max={totalMembers} />
      </div>

      {/* Per-participant progress dots. Each dot represents one participant
          in the session and lights up once that participant has cast at
          least one vote. Lets members see *who* the session is waiting on
          instead of just the bare X/Y count. Hidden when the session has
          no participant data (legacy sessions before the junction table). */}
      {participantIds.length > 0 && (
        <menu
          aria-label={t('vote.waiting', { done: voterCount, total: totalMembers })}
          className="mb-8 flex flex-wrap items-center justify-center gap-1.5 max-w-xs p-0"
        >
          {participantIds.map((pid) => {
            const voted = votedUserIds.has(pid)
            return (
              <li
                key={pid}
                aria-label={voted ? t('vote.participantVoted') : t('vote.participantWaiting')}
                className={`size-2.5 rounded-full transition-colors duration-300 ${
                  voted
                    ? 'bg-primary shadow-[0_0_8px_oklch(0.55_0.27_270_/_0.45)]'
                    : 'bg-muted-foreground/30'
                }`}
              />
            )
          })}
        </menu>
      )}

      {canClose && (
        <Button onClick={onClose} disabled={closing}>
          {closing && <Loader2 className="size-4 animate-spin" />}
          {t('vote.closeVote')}
        </Button>
      )}

      <Button
        variant="ghost"
        className="mt-4"
        onClick={onBack}
      >
        {t('vote.backToGroup')}
      </Button>
    </main>
  )
}
