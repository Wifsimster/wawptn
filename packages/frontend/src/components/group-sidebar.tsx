import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, UserPlus, Users, Trophy, History, Crown, UserMinus, Trash2, LogOut, Pencil, Bell, BellOff, CalendarClock, Lock, Newspaper, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { track } from '@/lib/analytics'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import { InviteLink } from '@/components/invite-link'
import { GroupStats } from '@/components/group-stats'
import { GameRecommendations } from '@/components/game-recommendations'
import { CronAutocomplete } from '@/components/cron-autocomplete'
import { getSteamHeaderImageUrl } from '@/lib/steam-cdn'
import { useSubscriptionStore } from '@/stores/subscription.store'

interface Member {
  id: string
  displayName: string
  avatarUrl: string
  role: string
  libraryVisible: boolean
  notificationsEnabled: boolean
}

interface VoteHistoryEntry {
  id: string
  winningGameAppId: number
  winningGameName: string
  closedAt: string
  createdBy: string
}

interface GroupSidebarProps {
  members: Member[]
  groupId: string
  groupName: string
  syncing: boolean
  inviteToken: string | null
  voteHistory: VoteHistoryEntry[]
  /** True when the free tier cap chopped the history — the sidebar shows an
   *  "upgrade to see full history" link instead of silently truncating. */
  voteHistoryTruncated: boolean
  onlineMembers: Set<string>
  lastSeenMap: Map<string, number>
  currentUserId: string
  currentUserRole: string
  autoVoteSchedule: string | null
  autoVoteDurationMinutes: number
  releasesDigestEnabled: boolean
  releasesDigestSchedule: string
  releasesDigestCoopOnly: boolean
  /** Null when the group has no linked Discord channel — the digest has
   *  nowhere to post, so the config entry point is shown disabled. */
  discordChannelId: string | null
  onSync: () => void
  onGenerateInvite: () => void
  onLeaveGroup: () => void
  onKickMember: (userId: string) => void
  onDeleteGroup: () => void
  onRenameGroup: (name: string) => Promise<void>
  onDeleteHistory: (sessionId: string) => void
  onToggleNotifications: (enabled: boolean) => void
  onUpdateAutoVote: (schedule: string | null, durationMinutes: number) => Promise<void>
  onUpdateReleasesDigest: (input: { enabled: boolean; schedule: string; coopOnly: boolean }) => Promise<void>
  /** Sends a one-off test message to the linked Discord channel so the
   *  owner can confirm the digest will land before relying on the schedule. */
  onTestReleasesDigest: () => Promise<void>
  /** When true, renders a compact layout for mobile bottom sheets (no Card wrappers) */
  compact?: boolean
}

/** Small uppercase divider label that groups the sidebar action buttons
 *  into member / group / premium / danger clusters so destructive and
 *  routine actions are no longer an undifferentiated stack. */
function SidebarSectionLabel({ children }: { children: string }) {
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

export function GroupSidebar({ members, groupId, groupName, syncing, inviteToken, voteHistory, voteHistoryTruncated, onlineMembers, lastSeenMap, currentUserId, currentUserRole, autoVoteSchedule, autoVoteDurationMinutes, releasesDigestEnabled, releasesDigestSchedule, releasesDigestCoopOnly, discordChannelId, onSync, onGenerateInvite, onLeaveGroup, onKickMember, onDeleteGroup, onRenameGroup, onDeleteHistory, onToggleNotifications, onUpdateAutoVote, onUpdateReleasesDigest, onTestReleasesDigest, compact = false }: GroupSidebarProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmKick, setConfirmKick] = useState<Member | null>(null)
  const [confirmDeleteHistory, setConfirmDeleteHistory] = useState<VoteHistoryEntry | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [autoVoteOpen, setAutoVoteOpen] = useState(false)
  const [autoVoteCron, setAutoVoteCron] = useState(autoVoteSchedule || '')
  const [autoVoteDuration, setAutoVoteDuration] = useState(autoVoteDurationMinutes)
  const [autoVoteSaving, setAutoVoteSaving] = useState(false)
  const [digestOpen, setDigestOpen] = useState(false)
  const [digestCron, setDigestCron] = useState(releasesDigestSchedule || '0 21 * * 5')
  const [digestCoopOnly, setDigestCoopOnly] = useState(releasesDigestCoopOnly)
  const [digestSaving, setDigestSaving] = useState(false)
  const [digestTesting, setDigestTesting] = useState(false)
  const { tier, status } = useSubscriptionStore()
  const isPremium = tier === 'premium' && status === 'active'

  const isOwner = currentUserRole === 'owner'

  // Sort: owner first, then online, then alphabetical
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
    const aOnline = onlineMembers.has(a.id)
    const bOnline = onlineMembers.has(b.id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  const historySection = voteHistory.length > 0 && (
    <div className={compact ? 'flex gap-2 sm:gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-1 -mx-1 px-1' : 'space-y-2'}>
      {voteHistory.map((session, index) => (
        <div key={session.id} className={compact
          ? 'flex-none w-[200px] snap-start rounded-lg border border-border bg-card/50 p-2 flex items-center gap-2 group/history'
          : 'flex items-center gap-3 group/history'
        }>
          <img
            src={getSteamHeaderImageUrl(session.winningGameAppId)}
            alt={session.winningGameName}
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
              {new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(session.closedAt))}
            </p>
          </div>
          {session.createdBy === currentUserId || currentUserRole === 'owner' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-8 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive active:bg-accent/10 ${compact ? 'opacity-100' : 'opacity-0 group-hover/history:opacity-100'} transition-opacity shrink-0`}
                  onClick={() => setConfirmDeleteHistory(session)}
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
  )

  // Shown under the history list when the free tier cap was hit. Renders
  // only when we actually have at least one session displayed AND the
  // backend flagged the response as truncated — we never nag on empty
  // histories. Premium users never see this.
  const historyUpgradeCta = voteHistoryTruncated && voteHistory.length > 0 && !isPremium && (
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

  const onlineCount = members.filter(m => onlineMembers.has(m.id)).length

  const membersHeader = (
    <div className="flex items-center justify-between">
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
      {!compact && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSync} disabled={syncing} aria-label={t('group.syncLibraries')} className="size-11 min-h-[44px] min-w-[44px] active:bg-accent/10">
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('group.syncLibraries')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  const membersList = (
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
                className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 ${compact ? 'border-background' : 'border-card'} ${isOnline ? 'bg-online animate-pulse' : 'bg-muted-foreground/40'}`}
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
                    className={`size-11 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive active:bg-accent/10 ${compact ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                    onClick={() => setConfirmKick(member)}
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
  )

  const currentMember = members.find(m => m.id === currentUserId)
  const notificationsEnabled = currentMember?.notificationsEnabled ?? true

  const actionButtons = (
    <div className="space-y-4">
      {/* Membre — actions available to every member */}
      <div className="space-y-1.5">
        <SidebarSectionLabel>{t('group.sectionMember')}</SidebarSectionLabel>
        {compact && (
          <Button
            variant="outline"
            className="w-full"
            onClick={onSync}
            disabled={syncing}
          >
            <RefreshCw className={`size-4 mr-2 ${syncing ? 'animate-spin text-primary' : ''}`} />
            {t('group.syncLibraries')}
          </Button>
        )}
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
          <SidebarSectionLabel>{t('group.sectionGroup')}</SidebarSectionLabel>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setRenameName(groupName); setRenameOpen(true) }}
          >
            <Pencil className="size-4 mr-2" />
            {t('group.renameGroup')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={onGenerateInvite}
          >
            <UserPlus className="size-4 mr-2" />
            {t('group.inviteFriend')}
          </Button>
          {inviteToken && <InviteLink token={inviteToken} />}
        </div>
      )}

      {/* Premium — owner-only scheduled automations */}
      {isOwner && (
        <div className="space-y-1.5">
          <SidebarSectionLabel>{t('group.sectionPremium')}</SidebarSectionLabel>
          {/* Auto-vote settings */}
          {isPremium ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setAutoVoteCron(autoVoteSchedule || '')
                setAutoVoteDuration(autoVoteDurationMinutes)
                setAutoVoteOpen(true)
              }}
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
              onClick={() => {
                setDigestCron(releasesDigestSchedule || '0 21 * * 5')
                setDigestCoopOnly(releasesDigestCoopOnly)
                setDigestOpen(true)
              }}
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
        <SidebarSectionLabel>{t('group.sectionDanger')}</SidebarSectionLabel>
        {!isOwner && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut className="size-4 mr-2" />
            {t('group.leaveGroup')}
          </Button>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4 mr-2" />
            {t('group.deleteGroup')}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <aside className="space-y-3">
      {compact ? (
        // Compact layout for mobile bottom sheets — no Card wrappers
        <div className="space-y-3">
          {historySection && (
            <div className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <History className="size-4" />
                {t('group.history')}
              </h2>
              {historySection}
              {historyUpgradeCta}
            </div>
          )}
          <GameRecommendations groupId={groupId} compact />
          <GroupStats groupId={groupId} compact />
          {membersHeader}
          {membersList}
          {actionButtons}
        </div>
      ) : (
        // Desktop layout with Card wrappers
        <>
          {historySection && (
            <Card>
              <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
                <h2 className="font-semibold flex items-center gap-2 text-sm">
                  <History className="size-4" />
                  {t('group.history')}
                </h2>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
                {historySection}
                {historyUpgradeCta}
              </CardContent>
            </Card>
          )}

          <GameRecommendations groupId={groupId} />

          <GroupStats groupId={groupId} />

          <Card>
            <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3 space-y-0">
              {membersHeader}
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
              {membersList}
              {actionButtons}
            </CardContent>
          </Card>
        </>
      )}

      {/* Leave confirmation dialog */}
      <ResponsiveDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.leaveConfirmTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.leaveConfirmDescription')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { setConfirmLeave(false); onLeaveGroup() }}>{t('group.leaveGroup')}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Delete confirmation dialog */}
      <ResponsiveDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.deleteConfirmTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.deleteConfirmDescription')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { setConfirmDelete(false); onDeleteGroup() }}>{t('group.deleteGroup')}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Kick confirmation dialog */}
      <ResponsiveDialog open={!!confirmKick} onOpenChange={(open) => !open && setConfirmKick(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.kickConfirmTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.kickConfirmDescription', { name: confirmKick?.displayName })}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setConfirmKick(null)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { if (confirmKick) { onKickMember(confirmKick.id); setConfirmKick(null) } }}>{t('group.kickConfirm')}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Rename group dialog */}
      <ResponsiveDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.renameTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.renameDescription')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (!renameName.trim() || renaming) return
            setRenaming(true)
            try {
              await onRenameGroup(renameName.trim())
              setRenameOpen(false)
            } finally {
              setRenaming(false)
            }
          }}>
            <div className="px-4 pb-4">
              <label htmlFor="rename-input" className="text-sm font-medium mb-2 block">{t('group.renameLabel')}</label>
              <Input
                id="rename-input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder={t('group.renamePlaceholder')}
                maxLength={100}
                autoFocus
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>
            <ResponsiveDialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>{t('group.cancel')}</Button>
              <Button type="submit" disabled={!renameName.trim() || renameName.trim() === groupName || renaming}>{t('group.renameSubmit')}</Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Delete history entry confirmation dialog */}
      <ResponsiveDialog open={!!confirmDeleteHistory} onOpenChange={(open) => !open && setConfirmDeleteHistory(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.deleteHistoryConfirmTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.deleteHistoryConfirmDescription', { name: confirmDeleteHistory?.winningGameName })}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteHistory(null)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { if (confirmDeleteHistory) { onDeleteHistory(confirmDeleteHistory.id); setConfirmDeleteHistory(null) } }}>{t('group.deleteHistoryConfirm')}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Auto-vote settings dialog */}
      <ResponsiveDialog open={autoVoteOpen} onOpenChange={setAutoVoteOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.autoVote')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.autoVoteHint')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (autoVoteSaving) return
            setAutoVoteSaving(true)
            try {
              await onUpdateAutoVote(autoVoteCron.trim() || null, autoVoteDuration)
              setAutoVoteOpen(false)
            } finally {
              setAutoVoteSaving(false)
            }
          }}>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label htmlFor="auto-vote-cron" className="text-sm font-medium mb-2 block">{t('group.autoVoteSchedule')}</label>
                <CronAutocomplete
                  id="auto-vote-cron"
                  value={autoVoteCron}
                  onChange={setAutoVoteCron}
                  placeholder={t('group.autoVotePlaceholder')}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">{t('group.autoVoteHint')}</p>
              </div>
              <div>
                <label htmlFor="auto-vote-duration" className="text-sm font-medium mb-2 block">{t('group.autoVoteDuration')}</label>
                <div className="flex gap-2">
                  {[
                    { value: 30, label: t('group.autoVoteDuration30') },
                    { value: 60, label: t('group.autoVoteDuration60') },
                    { value: 120, label: t('group.autoVoteDuration120') },
                    { value: 180, label: t('group.autoVoteDuration180') },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={autoVoteDuration === option.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAutoVoteDuration(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <ResponsiveDialogFooter>
              {autoVoteCron.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    setAutoVoteSaving(true)
                    try {
                      await onUpdateAutoVote(null, autoVoteDuration)
                      setAutoVoteCron('')
                      setAutoVoteOpen(false)
                    } finally {
                      setAutoVoteSaving(false)
                    }
                  }}
                  disabled={autoVoteSaving}
                >
                  {t('group.autoVoteDisabled')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setAutoVoteOpen(false)}>{t('group.cancel')}</Button>
              <Button type="submit" disabled={!autoVoteCron.trim() || autoVoteSaving}>{t('group.autoVoteSave')}</Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Weekly Steam releases digest settings dialog */}
      <ResponsiveDialog open={digestOpen} onOpenChange={setDigestOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.releasesDigest')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.releasesDigestHint')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (digestSaving || !digestCron.trim()) return
            setDigestSaving(true)
            try {
              await onUpdateReleasesDigest({ enabled: true, schedule: digestCron.trim(), coopOnly: digestCoopOnly })
              setDigestOpen(false)
            } finally {
              setDigestSaving(false)
            }
          }}>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label htmlFor="digest-cron" className="text-sm font-medium mb-2 block">{t('group.releasesDigestSchedule')}</label>
                <CronAutocomplete
                  id="digest-cron"
                  value={digestCron}
                  onChange={setDigestCron}
                  placeholder="0 21 * * 5"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t('group.releasesDigestFilter')}</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!digestCoopOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDigestCoopOnly(false)}
                  >
                    {t('group.releasesDigestFilterAll')}
                  </Button>
                  <Button
                    type="button"
                    variant={digestCoopOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDigestCoopOnly(true)}
                  >
                    {t('group.releasesDigestFilterCoop')}
                  </Button>
                </div>
              </div>
            </div>
            <ResponsiveDialogFooter>
              {releasesDigestEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    setDigestSaving(true)
                    try {
                      await onUpdateReleasesDigest({ enabled: false, schedule: digestCron.trim() || '0 21 * * 5', coopOnly: digestCoopOnly })
                      setDigestOpen(false)
                    } finally {
                      setDigestSaving(false)
                    }
                  }}
                  disabled={digestSaving}
                >
                  {t('group.releasesDigestDisable')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (digestTesting) return
                  setDigestTesting(true)
                  try {
                    await onTestReleasesDigest()
                  } finally {
                    setDigestTesting(false)
                  }
                }}
                disabled={digestTesting || digestSaving}
              >
                <Send className={`size-4 mr-2 ${digestTesting ? 'animate-pulse' : ''}`} />
                {t('group.releasesDigestTest')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDigestOpen(false)}>{t('group.cancel')}</Button>
              <Button type="submit" disabled={!digestCron.trim() || digestSaving}>
                {releasesDigestEnabled ? t('group.releasesDigestSave') : t('group.releasesDigestEnable')}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </aside>
  )
}
