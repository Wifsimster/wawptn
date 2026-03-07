import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface InviteLinkProps {
  token: string
}

export function InviteLink({ token }: InviteLinkProps) {
  const { t } = useTranslation()
  const url = `${window.location.origin}/join/${token}`
  const canShare = typeof navigator.share === 'function'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('invite.copied'))
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast.success(t('invite.copied'))
    }
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
        {canShare && (
          <Button size="sm" variant="secondary" onClick={handleShare} aria-label={t('invite.share')}>
            <Share2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
