import { RefreshCw, UserPlus, Users, Trophy, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
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
  onSync: () => void
  onGenerateInvite: () => void
}

export function GroupSidebar({ members, syncing, inviteToken, voteHistory, onlineMembers, onSync, onGenerateInvite }: GroupSidebarProps) {
  const { t, i18n } = useTranslation()

  // Sort: online first, then alphabetical
  const sortedMembers = [...members].sort((a, b) => {
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
              return (
                <div key={member.id} className="flex items-center gap-3 py-1.5">
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
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium truncate block ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
                    {member.role === 'owner' && (
                      <Badge variant="secondary" className="bg-primary/20 text-primary border-0">{t('group.roleOwner', 'owner')}</Badge>
                    )}
                  </div>
                  {!member.libraryVisible && (
                    <span className="text-xs text-destructive">{t('group.privateLibrary')}</span>
                  )}
                </div>
              )
            })}
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={onGenerateInvite}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {t('group.inviteFriend')}
          </Button>

          {inviteToken && <InviteLink token={inviteToken} />}
        </CardContent>
      </Card>
    </aside>
  )
}
