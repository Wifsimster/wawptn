import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface InviteLinkProps {
  token: string
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export function InviteLink({ token }: InviteLinkProps) {
  const { t } = useTranslation()
  // Use /invite/ path for rich embeds (Discord, Slack, Twitter), redirects to SPA
  const url = `${window.location.origin}/invite/${token}`
  const canShare = typeof navigator.share === 'function'

  const copyToClipboard = async (text: string) => {
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

  const handleCopy = async () => {
    await copyToClipboard(url)
    toast.success(t('invite.copied'))
  }

  const handleDiscordShare = async () => {
    const discordText = `${t('invite.discordMessage')}\n${url}`
    await copyToClipboard(discordText)
    toast.success(t('invite.discordCopied'))
  }

  const handleShare = async () => {
    try {
      await navigator.share({
        title: t('app.name'),
        text: t('invite.shareText'),
        url,
      })
    } catch (err) {
      // User cancelled share or not supported — fall back to copy
      if (err instanceof Error && err.name !== 'AbortError') {
        handleCopy()
      }
    }
  }

  return (
    <div className="mt-3 p-3 bg-background rounded-md border border-border">
      <p className="text-xs text-muted-foreground mb-1">{t('invite.shareLink')}</p>
      <code className="block text-xs bg-secondary px-2 py-1.5 rounded break-all mb-2">
        {url}
      </code>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleCopy}>
          {t('invite.copy')}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleDiscordShare} aria-label={t('invite.discord')}>
          <DiscordIcon className="w-3.5 h-3.5" />
        </Button>
        {canShare && (
          <Button size="sm" variant="secondary" onClick={handleShare} aria-label={t('invite.share')}>
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
