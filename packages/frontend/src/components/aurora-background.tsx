import { Component, lazy, Suspense, type ReactNode } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'

// `ogl` + the shader only load once this layer actually renders, keeping the
// WebGL background off the initial/LCP bundle (consistent with the route-level
// code splitting in App.tsx).
const Aurora = lazy(() => import('@/components/react-bits/aurora'))

// react-bits Aurora tuned for the "Neon Dusk" palette: a purple -> cyan ->
// purple sweep, kept faint (low amplitude, soft blend, slow drift) so it
// reads as atmosphere behind the UI rather than a foreground effect.
const COLOR_STOPS = ['#7C3AED', '#22D3EE', '#A855F7']

// The Aurora layer is purely decorative. If its chunk fails to load or the
// device has no usable WebGL context, render nothing — the CSS gradient
// layers in index.css already carry the background on their own.
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * App-wide ambient WebGL background. Mounted once, above the routed tree, so
 * the WebGL context is never torn down on navigation. Shows through wherever
 * a page leaves its root transparent (landing page, chrome-less routes) —
 * exactly like the existing CSS gradient mesh.
 */
export function AuroraBackground() {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  // A continuous full-screen WebGL shader costs more than the CSS effects the
  // "Mobile GPU relief" block in index.css already disables — so on coarse-
  // pointer phones we skip the layer (and its `ogl` chunk) entirely.
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
