import { useState } from 'react'
import { RefreshCw, UserPlus, Users, Trophy, History, Crown, UserMinus, Trash2, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { InviteLink } from '@/components/invite-link'

interface Member {
  id: string
  displayName: string
  avatarUrl: string
  role: string
  libraryVisible: boolean
}

interface VoteHistoryEntry {
  id: string
  winningGameAppId: number
  winningGameName: string
  closedAt: string
}

interface GroupSidebarProps {
  members: Member[]
  syncing: boolean
  inviteToken: string | null
  voteHistory: VoteHistoryEntry[]
  onlineMembers: Set<string>
  currentUserId: string
  currentUserRole: string
  onSync: () => void
  onGenerateInvite: () => void
  onLeaveGroup: () => void
  onKickMember: (userId: string) => void
  onDeleteGroup: () => void
}

export function GroupSidebar({ members, syncing, inviteToken, voteHistory, onlineMembers, currentUserId, currentUserRole, onSync, onGenerateInvite, onLeaveGroup, onKickMember, onDeleteGroup }: GroupSidebarProps) {
  const { t, i18n } = useTranslation()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmKick, setConfirmKick] = useState<Member | null>(null)

  const isOwner = currentUserRole === 'owner'

  // Sort: owner first, then online, then alphabetical
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
    const aOnline = onlineMembers.has(a.id)
    const bOnline = onlineMembers.has(b.id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  return (
    <aside className="space-y-4">
      {voteHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm">
              <History className="w-4 h-4" />
              {t('group.history')}
            </h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {voteHistory.map((session, index) => (
              <div key={session.id} className="flex items-center gap-3">
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
                {index === 0 && <Trophy className="w-4 h-4 text-primary shrink-0" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Users className="w-4 h-4" />
            {t('group.members', { count: members.length })}
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onSync} disabled={syncing} aria-label={t('group.syncLibraries')}>
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-primary' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('group.syncLibraries')}</TooltipContent>
          </Tooltip>
        </CardHeader>

        <CardContent className="space-y-3">
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
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card ${isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                      aria-label={isOnline ? 'En ligne' : 'Hors ligne'}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className={`text-sm font-medium truncate ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
                    {member.role === 'owner' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>{t('group.roleOwner')}</TooltipContent>
                      </Tooltip>
                    )}
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
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmKick(member)}
                          aria-label={t('group.kickMember', { name: member.displayName })}
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('group.kickMember', { name: member.displayName })}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )
            })}
          </div>

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

          {/* Leave / Delete actions */}
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
        </CardContent>
      </Card>

      {/* Leave confirmation dialog */}
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('group.leaveConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('group.leaveConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { setConfirmLeave(false); onLeaveGroup() }}>{t('group.leaveGroup')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('group.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('group.deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { setConfirmDelete(false); onDeleteGroup() }}>{t('group.deleteGroup')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kick confirmation dialog */}
      <Dialog open={!!confirmKick} onOpenChange={(open) => !open && setConfirmKick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('group.kickConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('group.kickConfirmDescription', { name: confirmKick?.displayName })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmKick(null)}>{t('group.cancel')}</Button>
            <Button variant="destructive" onClick={() => { if (confirmKick) { onKickMember(confirmKick.id); setConfirmKick(null) } }}>{t('group.kickConfirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
