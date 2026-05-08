import { motion, type Variants } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import type { ChallengeProgress } from '@wawptn/types'

// Tier styling uses the existing warm-cool-warm semantic tokens rather
// than raw amber/slate/yellow Tailwind hues so future palette tweaks
// flow through to challenges automatically. ember=Bronze, neon=Argent
// (cool metallic), reward=Or.
const TIER_STYLES: Record<number, { border: string; badgeVariant: 'reward' | 'info' | 'success'; label: string }> = {
  1: { border: 'border-l-ember/60', badgeVariant: 'reward', label: 'Bronze' },
  2: { border: 'border-l-neon/60', badgeVariant: 'info', label: 'Argent' },
  3: { border: 'border-l-reward/60', badgeVariant: 'reward', label: 'Or' },
}

const unlockPop: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
}

function formatProgress(challenge: ChallengeProgress): string {
  if (challenge.category === 'playtime' || challenge.category === 'dedication') {
    const currentH = Math.floor(challenge.progress / 60)
    const targetH = Math.floor(challenge.threshold / 60)
    return `${currentH}h / ${targetH}h`
  }
  return `${challenge.progress} / ${challenge.threshold}`
}

export function ChallengeCard({ challenge }: { challenge: ChallengeProgress }) {
  const { t } = useTranslation()
  const tier = TIER_STYLES[challenge.tier] || TIER_STYLES[1]!
  const isUnlocked = challenge.unlockedAt !== null

  return (
    <motion.div
      variants={unlockPop}
      className={`
        flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm
        border-l-[3px] transition-all duration-300 hover:bg-card/80 hover:border-border/70
        ${tier.border}
        ${isUnlocked ? 'ring-1 ring-inset ring-reward/10' : ''}
      `}
    >
      {/* Icon */}
      <div className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted/30">
        {challenge.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">{challenge.title}</span>
          {isUnlocked && (
            <Badge variant={tier.badgeVariant} className="text-[10px] py-0 h-5 shrink-0">
              {tier.label}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mb-1.5">{challenge.description}</p>

        {isUnlocked ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-success font-medium">
              {t('challenges.unlocked')}
            </span>
            {challenge.unlockedAt && (
              <span className="text-[10px] text-muted-foreground">
                — {new Date(challenge.unlockedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Progress value={challenge.percentage} className="h-1.5 flex-1" />
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              {formatProgress(challenge)}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
