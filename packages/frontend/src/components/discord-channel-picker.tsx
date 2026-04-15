import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Link2, RefreshCw, Check, Hash, ExternalLink } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'

type DiscordPhase = 'idle' | 'connecting' | 'ready'

export interface DiscordChannelSelection {
  guildId: string | null
  channelId: string | null
  guildName?: string | null
  channelName?: string | null
}

interface DiscordChannelPickerProps {
  value: DiscordChannelSelection
  onChange: (value: DiscordChannelSelection) => void
}

/**
 * Self-contained Discord OAuth + guild/channel picker UI. Used in the
 * "create a group" dialog and in the "link a Discord channel" banner on
 * the group detail page.
 *
 * The picker owns the OAuth popup lifecycle, the guilds/channels fetch
 * state, and the bot-not-in-guild fallback. On selection, the parent
 * receives both the raw IDs and the display names so it can preview the
 * choice and later POST/PATCH just the IDs.
 */
export function DiscordChannelPicker({ value, onChange }: DiscordChannelPickerProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<DiscordPhase>('idle')
  const [guilds, setGuilds] = useState<
    { id: string; name: string; iconUrl: string | null; canManage: boolean }[]
  >([])
  const [guildsLoading, setGuildsLoading] = useState(false)
  const [guildsError, setGuildsError] = useState<string | null>(null)
  const [channels, setChannels] = useState<
    { id: string; name: string; type: number }[]
  >([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [botInviteUrl, setBotInviteUrl] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)

  // 1. Ask the backend for a signed authorize URL.
  // 2. Open Discord in a popup; wait for a postMessage from the callback
  //    page served at /api/discord/oauth/callback.
  // 3. On success, fetch the list of guilds the user can manage.
  const handleConnect = useCallback(async () => {
    setGuildsError(null)
    setChannelsError(null)
    setBotInviteUrl(null)
    onChange({ guildId: null, channelId: null })
    try {
      const { url } = await api.getDiscordOAuthAuthorizeUrl()
      setPhase('connecting')
      const width = 520
      const height = 720
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2)
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2)
      popupRef.current = window.open(
        url,
        'wawptn-discord-oauth',
        `width=${width},height=${height},left=${left},top=${top}`,
      )
      if (!popupRef.current) {
        setPhase('idle')
        toast.error(t('createGroup.discordPopupBlocked'))
      }
    } catch (err) {
      setPhase('idle')
      const msg = err instanceof ApiError && err.code === 'discord_oauth_disabled'
        ? t('createGroup.discordOAuthDisabled')
        : err instanceof Error
          ? err.message
          : t('createGroup.discordConnectError')
      toast.error(msg)
    }
  }, [onChange, t])

  // Listen for the postMessage from the OAuth callback popup. The page
  // at /api/discord/oauth/callback posts either
  // { source: 'wawptn-discord-oauth', ok: true } or
  // { source: 'wawptn-discord-oauth', ok: false, error: '...' }.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { source?: string; ok?: boolean; error?: string } | null
      if (!data || data.source !== 'wawptn-discord-oauth') return
      popupRef.current = null
      if (data.ok) {
        setPhase('ready')
        setGuildsLoading(true)
        api.listDiscordGuilds()
          .then(({ guilds: g }) => setGuilds(g))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : t('createGroup.discordConnectError')
            setGuildsError(msg)
          })
          .finally(() => setGuildsLoading(false))
      } else {
        setPhase('idle')
        if (data.error && data.error !== 'access_denied') {
          toast.error(t('createGroup.discordConnectError'))
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [t])

  const handlePickGuild = useCallback(async (guildId: string) => {
    const guild = guilds.find((g) => g.id === guildId)
    onChange({ guildId, channelId: null, guildName: guild?.name ?? null, channelName: null })
    setChannels([])
    setChannelsError(null)
    setBotInviteUrl(null)
    setChannelsLoading(true)
    try {
      const { channels: c } = await api.listDiscordChannels(guildId)
      setChannels(c)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'bot_not_in_guild') {
        const inviteUrl = err.details['inviteUrl']
        if (typeof inviteUrl === 'string') setBotInviteUrl(inviteUrl)
        setChannelsError(t('createGroup.discordBotNotInGuild'))
      } else {
        const msg = err instanceof Error ? err.message : t('createGroup.discordConnectError')
        setChannelsError(msg)
      }
    } finally {
      setChannelsLoading(false)
    }
  }, [guilds, onChange, t])

  const handlePickChannel = useCallback((channelId: string | null) => {
    const channel = channelId ? channels.find((c) => c.id === channelId) : null
    onChange({
      guildId: value.guildId,
      channelId,
      guildName: value.guildName ?? null,
      channelName: channel?.name ?? null,
    })
  }, [channels, onChange, value.guildId, value.guildName])

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <Link2 className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t('createGroup.discordSectionTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('createGroup.discordSectionHint')}</p>
        </div>
      </div>

      {phase === 'idle' && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={handleConnect}
        >
          {t('createGroup.discordConnect')}
        </Button>
      )}

      {phase === 'connecting' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />
          {t('createGroup.discordConnecting')}
        </div>
      )}

      {phase === 'ready' && (
        <div className="space-y-3">
          {/* Guild picker */}
          <div className="space-y-1.5">
            <label htmlFor="discord-guild" className="text-xs font-medium text-muted-foreground">
              {t('createGroup.discordGuildLabel')}
            </label>
            {guildsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {t('common.loading', 'Chargement…')}
              </div>
            ) : guildsError ? (
              <p className="text-xs text-destructive">{guildsError}</p>
            ) : guilds.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('createGroup.discordNoGuilds')}</p>
            ) : (
              <select
                id="discord-guild"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={value.guildId ?? ''}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) void handlePickGuild(id)
                  else {
                    onChange({ guildId: null, channelId: null, guildName: null, channelName: null })
                    setChannels([])
                    setBotInviteUrl(null)
                  }
                }}
              >
                <option value="">{t('createGroup.discordGuildPlaceholder')}</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Channel picker — only visible once a guild is picked */}
          {value.guildId && (
            <div className="space-y-1.5">
              <label htmlFor="discord-channel" className="text-xs font-medium text-muted-foreground">
                {t('createGroup.discordChannelLabel')}
              </label>
              {channelsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {t('common.loading', 'Chargement…')}
                </div>
              ) : channelsError ? (
                <div className="space-y-2">
                  <p className="text-xs text-destructive">{channelsError}</p>
                  {botInviteUrl && (
                    <a
                      href={botInviteUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {t('createGroup.discordInviteBot')}
                    </a>
                  )}
                </div>
              ) : channels.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('createGroup.discordNoChannels')}</p>
              ) : (
                <select
                  id="discord-channel"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={value.channelId ?? ''}
                  onChange={(e) => handlePickChannel(e.target.value || null)}
                >
                  <option value="">{t('createGroup.discordChannelPlaceholder')}</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {value.guildId && value.channelId && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="w-3 h-3 text-primary" />
              <Hash className="w-3 h-3" />
              <span className="truncate">
                {channels.find((c) => c.id === value.channelId)?.name ?? value.channelName ?? ''}
              </span>
              <span className="opacity-50">·</span>
              <span className="truncate">
                {guilds.find((g) => g.id === value.guildId)?.name ?? value.guildName ?? ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
