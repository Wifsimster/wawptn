import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Terminal, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

/**
 * Two-step instructions for binding a Discord channel to a group via the
 * bot's `/wawptn-setup` slash command. Fetches the bot invite URL on mount
 * so the "invite the bot" button only shows when the backend has enough
 * config to surface it.
 */
export function DiscordSetupInstructions() {
  const { t } = useTranslation()
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api.getDiscordBotInviteUrl().then(
      (res) => {
        if (cancelled) return
        setEnabled(res.enabled)
        setInviteUrl(res.url)
      },
      () => {
        if (cancelled) return
        setEnabled(false)
        setInviteUrl(null)
      },
    )
    return () => { cancelled = true }
  }, [])

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3 text-sm">
      <ol className="space-y-3">
        <li className="flex items-start gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary shrink-0">
            <UserPlus className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm">{t('discordSetup.step1')}</p>
            {enabled && inviteUrl && (
              <Button asChild size="sm" variant="secondary">
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('discordSetup.inviteBot')}
                </a>
              </Button>
            )}
            {enabled === false && (
              <p className="text-xs text-muted-foreground">
                {t('discordSetup.disabled')}
              </p>
            )}
          </div>
        </li>
        <li className="flex items-start gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary shrink-0">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              {t('discordSetup.step2Before')}{' '}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/wawptn-setup</code>{' '}
              {t('discordSetup.step2After')}
            </p>
          </div>
        </li>
      </ol>
    </div>
  )
}
