import { RefreshCw, Share2, Users, Trophy, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
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
  onSync: () => void
  onGenerateInvite: () => void
}

export function GroupSidebar({ members, syncing, inviteToken, voteHistory, onSync, onGenerateInvite }: GroupSidebarProps) {
  const { t } = useTranslation()

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
                    {new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(session.closedAt))}
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
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onSync} disabled={syncing} aria-label={t('group.syncLibraries')}>
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-primary' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('group.syncLibraries')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onGenerateInvite} aria-label={t('group.invite')}>
                  <Share2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('group.generateInvite')}</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        <CardContent>
          {inviteToken && <InviteLink token={inviteToken} />}

          <div className="space-y-2 mt-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 py-1.5">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                  <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{member.displayName}</span>
                  {member.role === 'owner' && (
                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">owner</span>
                  )}
                </div>
                {!member.libraryVisible && (
                  <span className="text-xs text-destructive">{t('group.privateLibrary')}</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}
