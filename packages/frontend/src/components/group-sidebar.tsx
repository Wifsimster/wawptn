import { useState } from 'react'
import { RefreshCw, UserPlus, Users, Trophy, History, Crown, UserMinus, Trash2, LogOut, Pencil, Bell, BellOff, CalendarClock, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  onlineMembers: Set<string>
  currentUserId: string
  currentUserRole: string
  autoVoteSchedule: string | null
  autoVoteDurationMinutes: number
  onSync: () => void
  onGenerateInvite: () => void
  onLeaveGroup: () => void
  onKickMember: (userId: string) => void
  onDeleteGroup: () => void
  onRenameGroup: (name: string) => Promise<void>
  onDeleteHistory: (sessionId: string) => void
  onToggleNotifications: (enabled: boolean) => void
  onUpdateAutoVote: (schedule: string | null, durationMinutes: number) => Promise<void>
  onStartVote: () => void
  /** When true, renders a compact layout for mobile bottom sheets (no Card wrappers) */
  compact?: boolean
}

export function GroupSidebar({ members, groupId, groupName, syncing, inviteToken, voteHistory, onlineMembers, currentUserId, currentUserRole, autoVoteSchedule, autoVoteDurationMinutes, onSync, onGenerateInvite, onLeaveGroup, onKickMember, onDeleteGroup, onRenameGroup, onDeleteHistory, onToggleNotifications, onUpdateAutoVote, onStartVote, compact = false }: GroupSidebarProps) {
  const { t, i18n } = useTranslation()
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
    <div className="space-y-2">
      {voteHistory.map((session, index) => (
        <div key={session.id} className="flex items-center gap-3 group/history">
          <img
            src={`https://cdn.akamai.steamstatic.com/steam/apps/${session.winningGameAppId}/header.jpg`}
            alt={session.winningGameName}
            className="w-16 h-[34px] rounded object-cover shrink-0"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${index === 0 ? 'text-primary' : ''}`}>{session.winningGameName}</p>
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
                  className={`h-7 w-7 text-muted-foreground hover:text-destructive ${compact ? 'opacity-100' : 'opacity-0 group-hover/history:opacity-100'} transition-opacity shrink-0`}
                  onClick={() => setConfirmDeleteHistory(session)}
                  aria-label={t('group.deleteHistory')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('group.deleteHistory')}</TooltipContent>
            </Tooltip>
          ) : index === 0 ? (
            <Trophy className="w-4 h-4 text-primary shrink-0" />
          ) : null}
        </div>
      ))}
    </div>
  )

  const membersHeader = (
    <div className="flex items-center justify-between">
      <h2 className="font-semibold flex items-center gap-2 text-sm">
        <Users className="w-4 h-4" />
        {t('group.members', { count: members.length })}
      </h2>
      {!compact && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSync} disabled={syncing} aria-label={t('group.syncLibraries')}>
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('group.syncLibraries')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  const membersList = (
    <div className="space-y-2">
      {sortedMembers.map((member) => {
        const isOnline = onlineMembers.has(member.id)
        const isSelf = member.id === currentUserId
        return (
          <div key={member.id} className="flex items-center gap-3 py-1.5 group">
            <div className="relative">
              <Avatar className="w-8 h-8">
                <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${compact ? 'border-background' : 'border-card'} ${isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                aria-label={isOnline ? 'En ligne' : 'Hors ligne'}
              />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className={`text-sm font-medium truncate ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
              {member.role === 'owner' && (
                <Crown className="w-4 h-4 text-amber-500 shrink-0" aria-label={t('group.roleOwner')} />
              )}
            </div>
            {!member.libraryVisible && (
              <span className="text-xs text-destructive">{t('group.privateLibrary')}</span>
            )}
            {isOwner && !isSelf && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 text-muted-foreground hover:text-destructive ${compact ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                onClick={() => setConfirmKick(member)}
                aria-label={t('group.kickMember', { name: member.displayName })}
              >
                <UserMinus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )

  const actionButtons = (
    <div className="space-y-2">
      {compact && (
        <Button
          variant="outline"
          className="w-full"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin text-primary' : ''}`} />
          {t('group.syncLibraries')}
        </Button>
      )}

      {isOwner && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => { setRenameName(groupName); setRenameOpen(true) }}
        >
          <Pencil className="w-4 h-4 mr-2" />
          {t('group.renameGroup')}
        </Button>
      )}

      {isOwner && (
        <Button
          variant="outline"
          className="w-full"
          onClick={onGenerateInvite}
        >
          <UserPlus className="w-4 h-4 mr-2" />
          {t('group.inviteFriend')}
        </Button>
      )}

      {inviteToken && <InviteLink token={inviteToken} />}

      {/* Discord notification toggle */}
      {(() => {
        const currentMember = members.find(m => m.id === currentUserId)
        const enabled = currentMember?.notificationsEnabled ?? true
        return (
          <Button
            variant={enabled ? 'outline' : 'ghost'}
            className={`w-full ${!enabled ? 'text-muted-foreground' : ''}`}
            onClick={() => onToggleNotifications(!enabled)}
          >
            {enabled ? (
              <Bell className="w-4 h-4 mr-2" />
            ) : (
              <BellOff className="w-4 h-4 mr-2" />
            )}
            {enabled ? t('group.notificationsEnabled') : t('group.notificationsDisabled')}
          </Button>
        )
      })()}

      {/* Auto-vote settings (owner only, premium feature) */}
      {isOwner && (
        isPremium ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setAutoVoteCron(autoVoteSchedule || '')
              setAutoVoteDuration(autoVoteDurationMinutes)
              setAutoVoteOpen(true)
            }}
          >
            <CalendarClock className="w-4 h-4 mr-2" />
            {t('group.autoVote')}
            {autoVoteSchedule && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{t('group.autoVoteEnabled')}</Badge>
            )}
          </Button>
        ) : (
          <Button variant="outline" className="w-full opacity-60" onClick={() => window.location.href = '/subscription'}>
            <Lock className="w-4 h-4 mr-2 text-muted-foreground" />
            {t('group.autoVote')}
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{t('premium.featureLocked')}</Badge>
          </Button>
        )
      )}

      <div className="pt-2 border-t space-y-2">
        {!isOwner && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t('group.leaveGroup')}
          </Button>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('group.deleteGroup')}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <aside className="space-y-4">
      {compact ? (
        // Compact layout for mobile bottom sheets — no Card wrappers
        <div className="space-y-4">
          {historySection && (
            <div className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <History className="w-4 h-4" />
                {t('group.history')}
              </h2>
              {historySection}
            </div>
          )}
          <GameRecommendations groupId={groupId} onStartVote={onStartVote} compact />
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
              <CardHeader className="pb-3">
                <h2 className="font-semibold flex items-center gap-2 text-sm">
                  <History className="w-4 h-4" />
                  {t('group.history')}
                </h2>
              </CardHeader>
              <CardContent className="space-y-2">
                {historySection}
              </CardContent>
            </Card>
          )}

          <GameRecommendations groupId={groupId} onStartVote={onStartVote} />

          <GroupStats groupId={groupId} />

          <Card>
            <CardHeader className="space-y-0 pb-3">
              {membersHeader}
            </CardHeader>
            <CardContent className="space-y-3">
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
                <Input
                  id="auto-vote-cron"
                  value={autoVoteCron}
                  onChange={(e) => setAutoVoteCron(e.target.value)}
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
    </aside>
  )
}
