import { cn } from '@/lib/utils'

/**
 * Brand mark — a stylised "?" with an amber answer-diamond, sitting in a
 * gradient indigo tile. The artwork lives in three places that must stay in
 * sync: this component (rendered in-app), `public/logo.svg` (favicon) and
 * the generated `apple-touch-icon.png` / `pwa-*.png` files. The path data
 * and gradient stops here are the source of truth — if you change them,
 * regenerate the PNGs via `scripts/generate-logo-assets.mjs`.
 *
 * Two canonical sizes are used across the app:
 *   - 16px for inline contexts (footer, alongside body copy, sidebar headers)
 *   - 28px for the app-header brand mark
 * Other sizes are technically allowed (the prop is freeform), but adding a
 * third size should be a deliberate design decision rather than a drift —
 * see docs/design-review-2026-05-08.md §D9.
 */
interface WawptnLogoProps {
  size?: number
  className?: string
  variant?: 'mono' | 'color'
}

const QUESTION_MARK_PATH =
  'M188 196c0-44 36-80 80-80s80 36 80 80c0 35-24 56-48 70l-8 5v21h-40v-50l12-8c16-10 28-22 28-38 0-22-18-40-40-40s-40 18-40 40'
const ANSWER_DIAMOND_PATH = 'M268 364l28 28-28 28-28-28z'

export function WawptnLogo({ size = 24, className, variant = 'mono' }: WawptnLogoProps) {
  if (variant === 'color') {
    // Gradient stops match the `--primary` token (oklch 0.55 0.27 270) and
    // the diamond uses `--reward` (oklch 0.82 0.17 70). If those tokens
    // evolve, update the stops here too — the mark is a deliberate brand
    // element, not a runtime CSS-var binding (we want it identical in the
    // favicon, the PWA icon, and the in-app render).
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn('shrink-0', className)}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wawptn-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7C5CFF" />
            <stop offset="0.55" stopColor="#5B3FE0" />
            <stop offset="1" stopColor="#2E1F8C" />
          </linearGradient>
          <radialGradient id="wawptn-glow" cx="0.5" cy="0.42" r="0.55">
            <stop offset="0" stopColor="#A78BFA" stopOpacity="0.45" />
            <stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="512" height="512" rx="116" fill="url(#wawptn-bg)" />
        <rect x="4" y="4" width="504" height="504" rx="112" fill="url(#wawptn-glow)" />
        <rect x="2" y="2" width="508" height="508" rx="114" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" />
        <path d={QUESTION_MARK_PATH} stroke="#ffffff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
        <path d={ANSWER_DIAMOND_PATH} fill="#FBBF24" />
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect x="16" y="16" width="480" height="480" rx="108" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeWidth="14" strokeOpacity="0.18" />
      <path d={QUESTION_MARK_PATH} stroke="currentColor" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      <path d={ANSWER_DIAMOND_PATH} fill="currentColor" />
    </svg>
  )
}
