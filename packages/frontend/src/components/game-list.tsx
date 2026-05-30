import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CommonGame } from '@wawptn/types'
import { GameCard } from '@/components/game-card'

type Game = CommonGame

const VIRTUALIZE_THRESHOLD = 100

function computeColumnCount(width: number): number {
  if (width >= 1024) return 4
  if (width >= 640) return 3
  return 2
}

interface GameListProps {
  games: Game[]
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * Virtualized renderer used when the displayed list is large enough to
 * benefit from windowing. Lives in its own component so its column-count
 * state + ResizeObserver only exist while virtualization is actually
 * active (the parent gates the mount on `shouldVirtualize`). The
 * virtualizer relies on inline styles/refs on the scroll + item elements,
 * so those are preserved verbatim; only the container tag changed
 * (div → menu) and items render as <li> via GameCard.
 */
function VirtualizedGameList({ games, t }: GameListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Lazy initialiser measures the viewport once on mount instead of
  // syncing state from a prop inside an effect. Subsequent changes come
  // exclusively from the ResizeObserver below.
  const [columnCount, setColumnCount] = useState(() => computeColumnCount(window.innerWidth))

  const updateColumnCount = useCallback(() => {
    const w = scrollContainerRef.current?.offsetWidth ?? window.innerWidth
    setColumnCount(computeColumnCount(w))
  }, [])

  useEffect(() => {
    updateColumnCount()
    const observer = new ResizeObserver(updateColumnCount)
    const el = scrollContainerRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [updateColumnCount])

  const rowCount = Math.ceil(games.length / columnCount)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => {
      // aspect-[460/215] → height = width / (460/215) ≈ width * 0.467 + gap
      const containerWidth = scrollContainerRef.current?.offsetWidth ?? 300
      const gap = 8
      const cardWidth = (containerWidth - gap * (columnCount - 1)) / columnCount
      return cardWidth * (215 / 460) + gap
    },
    overscan: 3,
  })

  return (
    <menu
      ref={scrollContainerRef}
      className="overflow-y-auto m-0 p-0 list-none"
      style={{ maxHeight: '70dvh' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount
          const rowGames = games.slice(startIndex, startIndex + columnCount)
          return (
            <div
              key={virtualRow.key}
              className="grid gap-2 absolute w-full"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowGames.map((game) => (
                <GameCard key={game.steamAppId} game={game} t={t} />
              ))}
            </div>
          )
        })}
      </div>
    </menu>
  )
}

/**
 * Renders the displayed games either as a plain responsive grid or, for
 * large lists, a virtualized window. Splitting the virtualized branch into
 * its own component keeps the heavy virtualization hooks out of the small
 * grid path and confines the column-count state to where it's used.
 */
export function GameList({ games, t }: GameListProps) {
  if (games.length >= VIRTUALIZE_THRESHOLD) {
    return <VirtualizedGameList games={games} t={t} />
  }

  return (
    <menu className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 m-0 p-0 list-none">
      {games.map((game) => (
        <GameCard key={game.steamAppId} game={game} t={t} />
      ))}
    </menu>
  )
}
