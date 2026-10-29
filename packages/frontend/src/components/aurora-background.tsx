import { Component, lazy, Suspense, type ReactNode } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'

const Aurora = lazy(() => import('@/components/react-bits/aurora'))

const COLOR_STOPS = ['#7C3AED', '#22D3EE', '#A855F7']

class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function AuroraBackground() {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const lowPowerViewport = useMediaQuery('(pointer: coarse) and (max-width: 768px)')

  if (reduceMotion || lowPowerViewport) return null

  return (
    <div aria-hidden className="aurora-bg-layer">
      <SilentBoundary>
        <Suspense fallback={null}>
          <Aurora colorStops={COLOR_STOPS} amplitude={0.7} blend={0.8} speed={0.35} />
        </Suspense>
      </SilentBoundary>
    </div>
  )
}
