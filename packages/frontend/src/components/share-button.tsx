import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Link2, Share2, Twitter } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ShareButtonProps {
  /** The session ID used to build the share URL */
  sessionId: string
  /** Display title (used in the share text) */
  title: string
  /** Number of votes cast in this session — drives the social-proof
   *  flavour of the Twitter / Discord copy. */
  voteCount?: number
  /** Optional description (passed to the Web Share API) */
  description?: string
  /** Button style variant */
  variant?: 'default' | 'outline' | 'ghost'
  /** Button size override */
  size?: 'sm' | 'default' | 'lg'
  /** When true, render with the prominent "Annoncer le verdict" copy
   *  instead of the generic "Partager". Use at the result-reveal moment. */
  prominent?: boolean
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for non-secure contexts
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

export function ShareButton({
  sessionId,
  title,
  voteCount,
  description,
  variant = 'outline',
  size = 'sm',
  prominent = false,
}: ShareButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const shareUrl = `${window.location.origin}/share/vote/${sessionId}`
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  // Close on click outside
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleCopyLink = useCallback(async () => {
    await copyToClipboard(shareUrl)
    toast.success(t('share.linkCopied'))
    setOpen(false)
  }, [shareUrl, t])

  // Social-proof Twitter copy when we know the vote count; fall back to
  // the simpler "tonight we play X" wording when we don't.
  const twitterText = voteCount && voteCount > 0
    ? t('share.twitterText', { title, count: voteCount })
    : t('share.twitterTextNoCount', { title })

  const handleTwitterShare = useCallback(() => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      twitterText
    )}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }, [shareUrl, twitterText])

  const handleDiscordShare = useCallback(async () => {
    // Copy the full message body — title intro + URL — so when the user
    // pastes into Discord they get a richer message than just the bare
    // link. Discord auto-unfurls the URL via the OG preview server-side.
    const intro = t('share.discordIntro', { title })
    await copyToClipboard(`${intro}\n${shareUrl}`)
    toast.success(t('share.linkCopiedDiscord'))
    setOpen(false)
  }, [shareUrl, title, t])

  const handleWebShare = useCallback(async () => {
    try {
      await navigator.share({
        title: t('share.shareTitle'),
        text: description ?? t('share.twitterText', { title }),
        url: shareUrl,
      })
      setOpen(false)
    } catch (err) {
      // User cancelled — keep the menu open; fall back on real errors
      if (err instanceof Error && err.name !== 'AbortError') {
        await handleCopyLink()
      }
    }
  }, [description, handleCopyLink, shareUrl, t, title, setOpen])

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        ref={triggerRef}
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="gap-2"
      >
        <Share2 className="size-4" />
        {prominent ? t('share.promoteCta') : t('share.button')}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="share-popover"
            role="menu"
            aria-label={t('share.button')}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            // Anchor right-aligned so the popover stays inside the
            // viewport on phones <360px wide, where the centred variant
            // would overflow off-screen with no clipping ancestor to
            // catch it (mobile review §C4). The `right-0` placement is
            // safe even when the trigger is the rightmost element of a
            // CTA row — popover width (w-56 = 14rem) ≤ all phones.
            className={cn(
              'absolute right-0 sm:left-1/2 sm:right-auto top-full z-50 mt-2 w-56 sm:-translate-x-1/2 origin-top',
              'overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-2'
            )}
          >
            <ShareMenuItem
              icon={<Link2 className="size-4" />}
              label={t('share.copyLink')}
              onClick={handleCopyLink}
            />
            <ShareMenuItem
              icon={<Twitter className="size-4" />}
              label={t('share.shareOnTwitter')}
              onClick={handleTwitterShare}
            />
            <ShareMenuItem
              icon={<DiscordIcon className="size-4" />}
              label={t('share.shareOnDiscord')}
              onClick={handleDiscordShare}
            />
            {canWebShare && (
              <ShareMenuItem
                icon={<Share2 className="size-4" />}
                label={t('share.webShare')}
                onClick={handleWebShare}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ShareMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none',
        'transition-colors hover:bg-accent hover:text-accent-foreground',
        'focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-[2px] focus-visible:ring-ring/60'
      )}
    >
      <span className="flex size-4 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

