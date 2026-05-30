import { useEffect, useState, useRef } from 'react'
import { ExternalLink, Loader2, RefreshCw, CircleOff } from 'lucide-react'
import { m, AnimatePresence, useReducedMotion, animate, type Variants } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ShareButton } from '@/components/share-button'
import { CelebrationParticles } from '@/components/celebration-particles'
import type { VoteResult } from './types'

interface ResultScreenProps {
  result: VoteResult
  sessionId: string | null
  rematching: boolean
  onRematch: () => void
  onBack: () => void
  onSteamLaunch: (steamAppId: number) => void
}

interface NoWinnerResultProps {
  rematching: boolean
  onRematch: () => void
  onBack: () => void
  shouldReduceMotion: boolean
  headingRef: React.RefObject<HTMLHeadingElement | null>
}

/**
 * No-winner branch: drops the hero image + consensus bar and keeps only the
 * rescue actions. Rematch is promoted to the primary button here since it's
 * the only meaningful forward motion.
 */
function NoWinnerResult({ rematching, onRematch, onBack, shouldReduceMotion, headingRef }: NoWinnerResultProps) {
  const { t } = useTranslation()
  return (
    <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center p-4">
      <m.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.15 : 0.4 }}
        className="text-center max-w-md"
      >
        <output aria-live="polite" className="block">
          <CircleOff
            className="size-16 mx-auto mb-4 text-muted-foreground"
            aria-hidden="true"
          />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-heading font-bold mb-2 focus:outline-none"
          >
            {t('vote.noWinner')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t('vote.noWinnerDescription')}
          </p>
        </output>
        <div className="flex flex-col items-center gap-3">
          <Button onClick={onRematch} disabled={rematching}>
            {rematching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t('vote.rematch')}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            {t('vote.backToGroup')}
          </Button>
        </div>
      </m.div>
    </main>
  )
}

interface ConsensusBarProps {
  percent: number
  yesCount: number
  totalVoters: number
  displayPercent: number
  isUnanimous: boolean
  shouldReduceMotion: boolean
}

function ConsensusBar({ percent, yesCount, totalVoters, displayPercent, isUnanimous, shouldReduceMotion }: ConsensusBarProps) {
  const { t } = useTranslation()
  const fadeUp: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: shouldReduceMotion ? 0.15 : 0.45, ease: 'easeOut' },
    },
  }
  const consensusText = isUnanimous
    ? t('vote.unanimous')
    : t('vote.consensusPercent', { percent: displayPercent })

  return (
    <m.div variants={fadeUp} className="mb-8 w-full max-w-xs mx-auto">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span className="tabular-nums">{consensusText}</span>
        <span className="tabular-nums">
          {yesCount}/{totalVoters}
        </span>
      </div>
      {/* Visually-hidden native progress carries the semantics; the styled bar
          below renders the animated fill and is hidden from assistive tech. */}
      <progress
        className="sr-only"
        value={percent}
        max={100}
        aria-label={t('vote.consensusLabel')}
        aria-valuetext={`${percent}% — ${yesCount}/${totalVoters}`}
      />
      <div
        aria-hidden="true"
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <m.div
          className="h-full rounded-full bg-gradient-to-r from-reward to-warning shadow-[0_0_12px_oklch(0.82_0.17_70_/_0.45)]"
          initial={{ width: '0%' }}
          animate={{ width: `${percent}%` }}
          transition={{
            duration: shouldReduceMotion ? 0.15 : 1.1,
            delay: shouldReduceMotion ? 0 : 0.3,
            ease: 'easeOut',
          }}
        />
      </div>
    </m.div>
  )
}

interface WinnerResultProps {
  result: VoteResult
  sessionId: string | null
  rematching: boolean
  onRematch: () => void
  onBack: () => void
  onSteamLaunch: (steamAppId: number) => void
  shouldReduceMotion: boolean
  headingRef: React.RefObject<HTMLHeadingElement | null>
  showConsensus: boolean
  percent: number
  displayPercent: number
  isUnanimous: boolean
  particlesVisible: boolean
}

function WinnerResult({
  result,
  sessionId,
  rematching,
  onRematch,
  onBack,
  onSteamLaunch,
  shouldReduceMotion,
  headingRef,
  showConsensus,
  percent,
  displayPercent,
  isUnanimous,
  particlesVisible,
}: WinnerResultProps) {
  const { t } = useTranslation()

  // Reveal choreography. Kept simple under reduced motion: no stagger, no
  // spring, no keyframes — a single 0.15s fade replaces the whole sequence.
  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
        delayChildren: shouldReduceMotion ? 0 : 0.08,
      },
    },
  }

  const eyebrow: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: shouldReduceMotion ? 0.15 : 0.4, ease: 'easeOut' },
    },
  }

  const imageVariants: Variants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15 } },
      }
    : {
        hidden: { opacity: 0, scale: 0.94 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { type: 'spring', stiffness: 140, damping: 18 },
        },
      }

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.15 : 0.45,
        ease: 'easeOut',
      },
    },
  }

  return (
    <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center p-4">
      <AnimatePresence>
        <m.div
          initial="hidden"
          animate="visible"
          variants={container}
          className="text-center max-w-md w-full"
        >
          {/* Wrap the title block in a live region so SR users get the full
              "tonight you play → game name" announcement as one payload. */}
          <output aria-live="polite" aria-atomic="true" className="block">
            <m.p
              variants={eyebrow}
              className="text-sm text-muted-foreground mb-4 uppercase tracking-widest"
            >
              {t('vote.tonightYouPlay')}
            </m.p>

            {result.headerImageUrl && (
              <m.div variants={imageVariants} className="relative mb-6">
                {/* Warm reward glow that breathes around the image. The
                    cool primary rim underneath adds depth without stealing
                    focus from the orange payoff colour. */}
                <m.div
                  aria-hidden="true"
                  className="absolute -inset-6 bg-reward/30 blur-3xl rounded-3xl pointer-events-none"
                  animate={
                    shouldReduceMotion
                      ? undefined
                      : { opacity: [0.55, 0.85, 0.55], scale: [1, 1.04, 1] }
                  }
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -inset-3 bg-primary/15 blur-2xl rounded-3xl pointer-events-none"
                />
                <img
                  src={result.headerImageUrl}
                  alt=""
                  width={460}
                  height={215}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  className="relative w-full rounded-lg shadow-[0_30px_80px_-20px_oklch(0.82_0.17_70/0.45)] ring-1 ring-reward/40"
                />
                {/* Changing the key forces a fresh mount so the particle
                    generator re-randomises positions on rematch reveals. */}
                {particlesVisible && (
                  <CelebrationParticles
                    key={`result-burst-${result.steamAppId}`}
                    count={26}
                  />
                )}
              </m.div>
            )}

            <m.h1
              ref={headingRef}
              tabIndex={-1}
              variants={fadeUp}
              className="text-3xl font-heading font-bold mb-4 break-words text-balance focus:outline-none"
            >
              {result.gameName}
            </m.h1>
          </output>

          {showConsensus && (
            <ConsensusBar
              percent={percent}
              yesCount={result.yesCount}
              totalVoters={result.totalVoters}
              displayPercent={displayPercent}
              isUnanimous={isUnanimous}
              shouldReduceMotion={shouldReduceMotion}
            />
          )}

          {/* CTA ladder — Launch is the hero. Share + Back are equal-weight
              siblings on the row below. Rematch is demoted to a small text
              link because it throws away the group's decision, so it should
              read as a rescue hatch rather than a competing call-to-action. */}
          <m.div
            variants={fadeUp}
            className="flex flex-col items-center gap-3"
          >
            <m.div
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      // Steam-blue pulse — referenced by oklch so it
                      // tracks `--steam` if the brand evolves.
                      boxShadow: [
                        '0 0 0 0 oklch(0.55 0.18 240 / 0)',
                        '0 0 0 10px oklch(0.55 0.18 240 / 0.18)',
                        '0 0 0 0 oklch(0.55 0.18 240 / 0)',
                      ],
                    }
              }
              transition={{
                duration: 2.8,
                repeat: Infinity,
                delay: 2.2,
                ease: 'easeInOut',
              }}
              className="rounded-lg"
            >
              <Button
                variant="steam"
                size="lg"
                asChild
                className="h-14 px-10 text-base"
              >
                <a
                  href={`steam://run/${result.steamAppId}`}
                  className="gap-2"
                  onClick={() => onSteamLaunch(result.steamAppId)}
                >
                  <ExternalLink className="size-5" />
                  {t('vote.launchSteam')}
                </a>
              </Button>
            </m.div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              {sessionId && (
                <ShareButton
                  sessionId={sessionId}
                  title={result.gameName}
                  voteCount={result.yesCount}
                  description={t('vote.shareDescription', {
                    count: result.yesCount,
                    title: result.gameName,
                  })}
                  variant="default"
                  size="default"
                  prominent
                />
              )}
              <Button variant="ghost" size="sm" onClick={onBack}>
                {t('vote.backToGroup')}
              </Button>
            </div>

            <button
              type="button"
              onClick={onRematch}
              disabled={rematching}
              className="mt-1 inline-flex items-center gap-1.5 p-2 min-h-[44px] text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-dotted rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rematching ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {t('vote.rematch')}
            </button>
          </m.div>
        </m.div>
      </AnimatePresence>
    </main>
  )
}

/**
 * The reveal screen — the payoff of the whole app. Sequencing is intentional:
 * eyebrow → image (spring + warm glow) → confetti burst → heading → consensus
 * bar with count-up → CTA ladder. The CTA ladder demotes "Relancer un vote"
 * to a small rescue link since rematching throws away the group's decision.
 * Everything collapses to a single fade when prefers-reduced-motion is on.
 */
export function ResultScreen({
  result,
  sessionId,
  rematching,
  onRematch,
  onBack,
  onSteamLaunch,
}: ResultScreenProps) {
  const shouldReduceMotion = useReducedMotion() ?? false
  const headingRef = useRef<HTMLHeadingElement>(null)

  const hasWinner = Number.isInteger(result.steamAppId) && result.steamAppId > 0
  const percent =
    result.totalVoters > 0
      ? Math.round((result.yesCount / result.totalVoters) * 100)
      : 0
  // Suppress the consensus block in the solo case — "100 % of 1" reads as
  // clinical rather than celebratory and just eats vertical space.
  const showConsensus = hasWinner && result.totalVoters > 1
  const isUnanimous = percent === 100 && result.totalVoters > 1

  // Animated count-up for the consensus percentage. Framer-motion's
  // imperative `animate` drives a React state through its onUpdate callback;
  // under reduced motion we skip the animation and show the final value
  // directly (derived during render, no setState in the effect body).
  const [animatedPercent, setAnimatedPercent] = useState(0)
  const displayPercent = shouldReduceMotion ? percent : animatedPercent
  useEffect(() => {
    if (!showConsensus || shouldReduceMotion) return
    const controls = animate(0, percent, {
      duration: 1.1,
      delay: 0.3,
      ease: 'easeOut',
      onUpdate: (v) => setAnimatedPercent(Math.round(v)),
    })
    return () => controls.stop()
  }, [percent, shouldReduceMotion, showConsensus])

  // Move focus to the heading on mount so screen reader users hear the reveal
  // as a state change instead of silently landing on a new UI.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  // One-shot celebration burst — fires after the image lands. Skipped under
  // reduced-motion and when there's no winner to celebrate.
  const [particlesVisible, setParticlesVisible] = useState(false)
  useEffect(() => {
    if (shouldReduceMotion || !hasWinner) return
    const timer = setTimeout(() => setParticlesVisible(true), 550)
    return () => clearTimeout(timer)
  }, [shouldReduceMotion, hasWinner])

  if (!hasWinner) {
    return (
      <NoWinnerResult
        rematching={rematching}
        onRematch={onRematch}
        onBack={onBack}
        shouldReduceMotion={shouldReduceMotion}
        headingRef={headingRef}
      />
    )
  }

  return (
    <WinnerResult
      result={result}
      sessionId={sessionId}
      rematching={rematching}
      onRematch={onRematch}
      onBack={onBack}
      onSteamLaunch={onSteamLaunch}
      shouldReduceMotion={shouldReduceMotion}
      headingRef={headingRef}
      showConsensus={showConsensus}
      percent={percent}
      displayPercent={displayPercent}
      isUnanimous={isUnanimous}
      particlesVisible={particlesVisible}
    />
  )
}
