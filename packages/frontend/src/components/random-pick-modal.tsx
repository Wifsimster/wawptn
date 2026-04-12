import { useState, useCallback, useEffect } from 'react'
import { ExternalLink, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Game {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
}

interface RandomPickModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  games: Game[]
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled
}

/** Celebration sparkle particles shown on reveal */
function CelebrationParticles() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 0.7 + Math.random() * 0.5,
    size: 4 + Math.random() * 8,
    color: i % 3 === 0 ? 'bg-primary/60' : i % 3 === 1 ? 'bg-neon/50' : 'bg-ember/50',
  }))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className={`absolute rounded-full ${p.color}`}
          style={{ left: `${p.x}%`, width: p.size, height: p.size }}
          initial={{ y: '50%', opacity: 1, scale: 0 }}
          animate={{ y: '-120%', opacity: 0, scale: 1.2 }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

function RandomPickContent({ games }: { games: Game[] }) {
  const { t } = useTranslation()
  // Lazy initializer — only runs once on mount (when dialog opens)
  const [deck, setDeck] = useState(() => shuffleArray(games))
  const [deckIndex, setDeckIndex] = useState(0)
  const [pickCount, setPickCount] = useState(1)

  const currentGame = deck[deckIndex]!

  const reroll = useCallback(() => {
    if (games.length <= 1) return

    setDeckIndex(prev => {
      const nextIndex = prev + 1
      if (nextIndex >= deck.length) {
        setDeck(shuffleArray(games))
        return 0
      }
      return nextIndex
    })
    setPickCount(prev => prev + 1)
  }, [games, deck.length])

  // Keyboard: Space/Enter to re-roll, Escape handled by Dialog
  useEffect(() => {
    if (games.length <= 1) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        reroll()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [games.length, reroll])

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${currentGame.steamAppId}-${pickCount}`}
        initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
        animate={{ rotateY: 0, opacity: 1, scale: 1 }}
        exit={{ rotateY: -90, opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, duration: 0.3 }}
        className="relative"
      >
        <CelebrationParticles />
        <Card className="border-0 rounded-none shadow-none">
          {currentGame.headerImageUrl && (
            <motion.img
              src={currentGame.headerImageUrl}
              alt={currentGame.gameName}
              className="w-full aspect-[460/215] object-cover sm:rounded-t-lg"
              initial={{ scale: 1.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          )}
          <div className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
            <motion.div
              className="text-center"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.3, ease: 'easeOut' }}
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {t('randomPick.pickNumber', { number: pickCount })}
              </p>
              <h2 className="text-2xl sm:text-xl font-bold">{currentGame.gameName}</h2>
            </motion.div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="secondary"
                className="w-full sm:w-auto sm:flex-1 gap-2"
                onClick={reroll}
                disabled={games.length <= 1}
              >
                <RotateCcw className="w-4 h-4" />
                {t('randomPick.reroll')}
              </Button>

              {Number.isInteger(currentGame.steamAppId) && currentGame.steamAppId > 0 && (
                <Button variant="steam" className="w-full sm:w-auto sm:flex-1 gap-2" asChild>
                  <a href={`steam://run/${currentGame.steamAppId}`}>
                    <ExternalLink className="w-4 h-4" />
                    {t('randomPick.launch')}
                  </a>
                </Button>
              )}
            </div>

            {games.length <= 1 && (
              <p className="text-xs text-muted-foreground text-center">
                {t('randomPick.onlyOneGame')}
              </p>
            )}

            {games.length > 1 && (
              <p className="text-xs text-muted-foreground text-center hidden sm:block">
                {t('randomPick.keyboardHint')}
              </p>
            )}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}

export function RandomPickModal({ open, onOpenChange, games }: RandomPickModalProps) {
  const { t } = useTranslation()
  const [sessionKey, setSessionKey] = useState(0)

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setSessionKey(prev => prev + 1)
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <ResponsiveDialogTitle className="sr-only">{t('randomPick.title')}</ResponsiveDialogTitle>
        {open && games.length > 0 && <RandomPickContent key={sessionKey} games={games} />}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
