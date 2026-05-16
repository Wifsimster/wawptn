import { cn } from '@/lib/utils'

/**
 * Brand mark — a game controller (d-pad + an amber action button) sitting
 * in a gradient indigo tile. It says what the app is for: picking a game to
 * play together. The artwork lives in three places that must stay in sync:
 * this component (rendered in-app), `public/logo.svg` (favicon) and the
 * generated `apple-touch-icon.png` / `pwa-*.png` files. The path data and
 * gradient stops here are the source of truth — if you change them,
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

// Controller body with the d-pad cut out as a hole (relies on evenodd fill).
const GAMEPAD_PATH =
  'M256 180C296 180 330 184 350 196C372 209 384 230 404 286C418 324 410 344 384 342C360 340 340 322 312 306C296 297 280 296 256 296C232 296 216 297 200 306C172 322 152 340 128 342C102 344 94 324 108 286C128 230 140 209 162 196C182 184 216 180 256 180ZM173 220H203V237H220V267H203V284H173V267H156V237H173V220Z'
// Secondary face button, also a hole — keeps a gamepad read in the mono variant.
const SECONDARY_BUTTON_PATH = 'M287 278A17 17 0 1 0 321 278A17 17 0 1 0 287 278Z'
// Amber action button — the brand accent, drawn filled on top in the color variant.
const ACTION_BUTTON_PATH = 'M319 238A23 23 0 1 0 365 238A23 23 0 1 0 319 238Z'

export function WawptnLogo({ size = 24, className, variant = 'mono' }: WawptnLogoProps) {
  if (variant === 'color') {
    // Gradient stops match the `--primary` token (oklch 0.55 0.27 270) and
    // the action button uses `--reward` (oklch 0.82 0.17 70). If those tokens
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
        <path d={`${GAMEPAD_PATH}${SECONDARY_BUTTON_PATH}`} fillRule="evenodd" clipRule="evenodd" fill="#ffffff" />
        <path d={ACTION_BUTTON_PATH} fill="#FBBF24" />
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
      <path
        d={`${GAMEPAD_PATH}${SECONDARY_BUTTON_PATH}${ACTION_BUTTON_PATH}`}
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
      />
    </svg>
  )
}
