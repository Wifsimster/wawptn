import { useState, useCallback, useEffect } from 'react'
import { ExternalLink, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Game {
  steamAppId: number
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
        initial={{ rotateY: 90, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        exit={{ rotateY: -90, opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-0 rounded-none shadow-none">
          {currentGame.headerImageUrl && (
            <img
              src={currentGame.headerImageUrl}
              alt={currentGame.gameName}
              className="w-full aspect-[460/215] object-cover"
            />
          )}
          <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {t('randomPick.pickNumber', { number: pickCount })}
              </p>
              <h2 className="text-xl font-bold">{currentGame.gameName}</h2>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1 gap-2"
                onClick={reroll}
                disabled={games.length <= 1}
              >
                <RotateCcw className="w-4 h-4" />
                {t('randomPick.reroll')}
              </Button>

              {Number.isInteger(currentGame.steamAppId) && currentGame.steamAppId > 0 && (
                <Button variant="steam" className="flex-1 gap-2" asChild>
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
              <p className="text-xs text-muted-foreground text-center">
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{t('randomPick.title')}</DialogTitle>
        {open && games.length > 0 && <RandomPickContent key={sessionKey} games={games} />}
      </DialogContent>
    </Dialog>
  )
}
