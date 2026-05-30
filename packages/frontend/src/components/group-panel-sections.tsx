import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, UserPlus, Users, Trophy, History, Crown, UserMinus, Trash2, LogOut, Pencil, Bell, BellOff, CalendarClock, Lock, Newspaper } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { InviteLink } from '@/components/invite-link'
import { track } from '@/lib/analytics'
import { getSteamHeaderImageUrl } from '@/lib/steam-cdn'

export interface Member {
  id: string
  displayName: string
  avatarUrl: string
  role: string
  libraryVisible: boolean
  notificationsEnabled: boolean
}

export interface VoteHistoryEntry {
  id: string
  winningGameAppId: number
  winningGameName: string
  closedAt: string
  createdBy: string
}

/** Small uppercase divider label that groups the settings actions into
 *  member / group / premium / danger clusters so destructive and routine
 *  actions are no longer an undifferentiated stack. */
function PanelSectionLabel({ children }: { children: string }) {
  return (
    <p className="px-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

function getLastSeenLabel(
  lastSeenTs: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!lastSeenTs) return t('groups.lastSeen.offline')
  const diffMs = Date.now() - lastSeenTs
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return t('groups.lastSeen.justNow')
  if (diffMinutes < 5) return t('groups.lastSeen.fewMinutes')
  if (diffMinutes < 60) return t('groups.lastSeen.minutesAgo', { count: diffMinutes })
  return t('groups.lastSeen.offline')
}

interface MembersSectionProps {
  members: Member[]
  sortedMembers: Member[]
  onlineMembers: Set<string>
  lastSeenMap: Map<string, number>
  currentUserId: string
  isOwner: boolean
  inviteToken: string | null
  onGenerateInvite: () => void
  onKickMember: (member: Member) => void
}

export function MembersSection({ members, sortedMembers, onlineMembers, lastSeenMap, currentUserId, isOwner, inviteToken, onGenerateInvite, onKickMember }: MembersSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const onlineCount = members.filter(m => onlineMembers.has(m.id)).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex items-center gap-2 text-sm">
          <Users className="size-4" />
          {t('group.members', { count: members.length })}
        </h2>
        {onlineCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal">
            <span className="size-1.5 rounded-full bg-online animate-pulse" />
            {t('groups.onlineCount', { count: onlineCount })}
          </Badge>
        )}
      </div>

      <div className="space-y-1 sm:space-y-2">
        {sortedMembers.map((member) => {
          const isOnline = onlineMembers.has(member.id)
          const isSelf = member.id === currentUserId
          const presenceLabel = isOnline
            ? t('groups.lastSeen.online')
            : getLastSeenLabel(lastSeenMap.get(member.id), t)
          return (
            <div key={member.id} className={`flex items-center gap-3 min-h-[48px] py-1.5 px-1 -mx-1 rounded-md group transition-opacity ${!isOnline ? 'opacity-60' : ''}`}>
              <button
                type="button"
                onClick={() => !isSelf && navigate(`/u/${member.id}`)}
                disabled={isSelf}
                className={`relative shrink-0 rounded-full ${isSelf ? 'cursor-default' : 'hover:ring-2 hover:ring-primary/40 transition-shadow cursor-pointer'}`}
                aria-label={isSelf ? member.displayName : `Voir le profil de ${member.displayName}`}
              >
                <Avatar className="size-8">
                  <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                  <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span
                  className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background ${isOnline ? 'bg-online animate-pulse' : 'bg-muted-foreground/40'}`}
                  aria-label={presenceLabel}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {isSelf ? (
                        <span className={`text-sm font-medium truncate ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/u/${member.id}`)}
                          className={`text-sm font-medium truncate text-left hover:text-primary transition-colors ${!isOnline ? 'text-muted-foreground' : ''}`}
                        >
                          {member.displayName}
                        </button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {member.displayName}
                    </TooltipContent>
                  </Tooltip>
                  {member.role === 'owner' && (
                    <Crown className="size-4 text-reward shrink-0" aria-label={t('group.roleOwner')} />
                  )}
                </div>
                <p className={`text-[11px] leading-tight ${isOnline ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                  {presenceLabel}
                </p>
              </div>
              {!member.libraryVisible && (
                <span className="text-xs text-destructive">{t('group.privateLibrary')}</span>
              )}
              {isOwner && !isSelf && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive active:bg-accent/10"
                      onClick={() => onKickMember(member)}
                      aria-label={t('group.kickMember', { name: member.displayName })}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {t('group.kickMember', { name: member.displayName })}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )
        })}
      </div>

      {isOwner && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <Button variant="outline" className="w-full" onClick={onGenerateInvite}>
            <UserPlus className="size-4 mr-2" />
            {t('group.inviteFriend')}
          </Button>
          {inviteToken && <InviteLink token={inviteToken} />}
        </div>
      )}
    </div>
  )
}

interface HistorySectionProps {
  voteHistory: VoteHistoryEntry[]
  voteHistoryTruncated: boolean
  currentUserId: string
  currentUserRole: string
  isPremium: boolean
  language: string
  onDeleteHistory: (entry: VoteHistoryEntry) => void
}

export function HistorySection({ voteHistory, voteHistoryTruncated, currentUserId, currentUserRole, isPremium, language, onDeleteHistory }: HistorySectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const historyDateFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }),
    [language],
  )

  if (voteHistory.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={t('group.historyEmptyTitle')}
        description={t('group.historyEmptyDescription')}
      />
    )
  }

  // Shown under the history list when the free tier cap was hit. Renders
  // only when we actually have at least one session displayed AND the
  // backend flagged the response as truncated. Premium users never see this.
  const historyUpgradeCta = voteHistoryTruncated && !isPremium && (
    <button
      type="button"
      onClick={() => {
        track('premium.upgrade_clicked', { from: 'history' })
        navigate('/subscription?from=history')
      }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors w-full text-left px-1"
    >
      <Lock className="size-3 shrink-0" />
      <span>{t('group.historyUpgradeCta')}</span>
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {voteHistory.map((session, index) => (
          <div key={session.id} className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-2 group/history">
            <img
              src={getSteamHeaderImageUrl(session.winningGameAppId)}
              alt={session.winningGameName}
              width={64}
              height={34}
              className="w-16 h-[34px] rounded object-cover shrink-0"
              loading="lazy"
            />
            <div className="flex-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className={`text-sm font-medium truncate ${index === 0 ? 'text-primary' : ''}`}>{session.winningGameName}</p>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {session.winningGameName}
                </TooltipContent>
              </Tooltip>
              <p className="text-xs text-muted-foreground">
                {historyDateFormat.format(new Date(session.closedAt))}
              </p>
            </div>
            {session.createdBy === currentUserId || currentUserRole === 'owner' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive active:bg-accent/10 shrink-0"
                    onClick={() => onDeleteHistory(session)}
                    aria-label={t('group.deleteHistory')}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('group.deleteHistory')}</TooltipContent>
              </Tooltip>
            ) : index === 0 ? (
              <Trophy className="size-4 text-primary shrink-0" />
            ) : null}
          </div>
        ))}
      </div>
      {historyUpgradeCta}
    </div>
  )
}

interface SettingsActionsProps {
  isOwner: boolean
  isPremium: boolean
  syncing: boolean
  notificationsEnabled: boolean
  autoVoteSchedule: string | null
  releasesDigestEnabled: boolean
  discordChannelId: string | null
  onSync: () => void
  onToggleNotifications: (enabled: boolean) => void
  onOpenRename: () => void
  onOpenAutoVote: () => void
  onOpenDigest: () => void
  onLeave: () => void
  onDelete: () => void
}

export function SettingsActions({ isOwner, isPremium, syncing, notificationsEnabled, autoVoteSchedule, releasesDigestEnabled, discordChannelId, onSync, onToggleNotifications, onOpenRename, onOpenAutoVote, onOpenDigest, onLeave, onDelete }: SettingsActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Membre — actions available to every member */}
      <div className="space-y-1.5">
        <PanelSectionLabel>{t('group.sectionMember')}</PanelSectionLabel>
        <Button
          variant="outline"
          className="w-full"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={`size-4 mr-2 ${syncing ? 'animate-spin text-primary' : ''}`} />
          {t('group.syncLibraries')}
        </Button>
        <Button
          variant={notificationsEnabled ? 'outline' : 'ghost'}
          className={`w-full ${!notificationsEnabled ? 'text-muted-foreground' : ''}`}
          onClick={() => onToggleNotifications(!notificationsEnabled)}
        >
          {notificationsEnabled ? (
            <Bell className="size-4 mr-2" />
          ) : (
            <BellOff className="size-4 mr-2" />
          )}
          {notificationsEnabled ? t('group.notificationsEnabled') : t('group.notificationsDisabled')}
        </Button>
      </div>

      {/* Groupe — owner-only group management */}
      {isOwner && (
        <div className="space-y-1.5">
          <PanelSectionLabel>{t('group.sectionGroup')}</PanelSectionLabel>
          <Button
            variant="outline"
            className="w-full"
            onClick={onOpenRename}
          >
            <Pencil className="size-4 mr-2" />
            {t('group.renameGroup')}
          </Button>
        </div>
      )}

      {/* Premium — owner-only scheduled automations */}
      {isOwner && (
        <div className="space-y-1.5">
          <PanelSectionLabel>{t('group.sectionPremium')}</PanelSectionLabel>
          {/* Auto-vote settings */}
          {isPremium ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenAutoVote}
            >
              <CalendarClock className="size-4 mr-2" />
              {t('group.autoVote')}
              {autoVoteSchedule && (
                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{t('group.autoVoteEnabled')}</Badge>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full opacity-60"
              onClick={() => {
                track('premium.upgrade_clicked', { from: 'auto_vote' })
                window.location.href = '/subscription?from=auto_vote'
              }}
            >
              <Lock className="size-4 mr-2 text-muted-foreground" />
              {t('group.autoVote')}
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{t('premium.featureLocked')}</Badge>
            </Button>
          )}

          {/* Weekly Steam releases digest (needs a linked Discord channel) */}
          {!discordChannelId ? (
            <Button
              variant="outline"
              className="w-full opacity-60"
              disabled
              title={t('group.releasesDigestNeedsDiscord')}
            >
              <Newspaper className="size-4 mr-2 text-muted-foreground" />
              {t('group.releasesDigest')}
            </Button>
          ) : isPremium ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenDigest}
            >
              <Newspaper className="size-4 mr-2" />
              {t('group.releasesDigest')}
              {releasesDigestEnabled && (
                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{t('group.releasesDigestEnabled')}</Badge>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full opacity-60"
              onClick={() => {
                track('premium.upgrade_clicked', { from: 'releases_digest' })
                window.location.href = '/subscription?from=releases_digest'
              }}
            >
              <Lock className="size-4 mr-2 text-muted-foreground" />
              {t('group.releasesDigest')}
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{t('premium.featureLocked')}</Badge>
            </Button>
          )}
        </div>
      )}

      {/* Zone de danger — irreversible actions, fenced off from routine ones */}
      <div className="space-y-1.5 border-t border-border pt-3">
        <PanelSectionLabel>{t('group.sectionDanger')}</PanelSectionLabel>
        {!isOwner && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onLeave}
          >
            <LogOut className="size-4 mr-2" />
            {t('group.leaveGroup')}
          </Button>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="size-4 mr-2" />
            {t('group.deleteGroup')}
          </Button>
        )}
      </div>
    </div>
  )
}
