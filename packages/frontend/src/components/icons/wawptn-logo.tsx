import { cn } from '@/lib/utils'

interface WawptnLogoProps {
  size?: number
  className?: string
  variant?: 'mono' | 'color'
}

export function WawptnLogo({ size = 24, className, variant = 'mono' }: WawptnLogoProps) {
  if (variant === 'color') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wawptn-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7C3AED" />
            <stop offset="1" stopColor="#4338CA" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="10" fill="url(#wawptn-bg)" />
        <path
          d="M18.5 18.5c0-4 3.3-7.5 7.5-7.5s7.5 3.5 7.5 7.5c0 3.2-2.2 5.2-4.5 6.5l-.7.5V27h-3.8v-4.7l1.1-.7c1.5-1 2.6-2 2.6-3.6 0-2-1.7-3.7-3.7-3.7s-3.7 1.7-3.7 3.7"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M24.8 33.5l2.2 2.2-2.2 2.2-2.2-2.2z" fill="#FBBF24" />
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="44" height="44" rx="10" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
      <path
        d="M18.5 18.5c0-4 3.3-7.5 7.5-7.5s7.5 3.5 7.5 7.5c0 3.2-2.2 5.2-4.5 6.5l-.7.5V27h-3.8v-4.7l1.1-.7c1.5-1 2.6-2 2.6-3.6 0-2-1.7-3.7-3.7-3.7s-3.7 1.7-3.7 3.7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M24.8 33.5l2.2 2.2-2.2 2.2-2.2-2.2z" fill="currentColor" />
    </svg>
  )
}
