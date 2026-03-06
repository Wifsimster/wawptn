import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogIn, LogOut, Users, Gamepad2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { useGroupStore } from '@/stores/group.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AppHeader } from '@/components/app-header'
import { InviteLink } from '@/components/invite-link'

export function GroupsPage() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const { groups, loading, fetchGroups, createGroup, joinGroup } = useGroupStore()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [inviteResult, setInviteResult] = useState<string | null>(null)

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const handleCreate = async () => {
    if (!groupName.trim()) return
    try {
      const result = await createGroup(groupName.trim())
      setInviteResult(result.inviteToken)
      setGroupName('')
      fetchGroups()
      toast.success(t('createGroup.success'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('createGroup.error'))
    }
  }

  const handleJoin = async () => {
    if (!inviteToken.trim()) return
    try {
      const result = await joinGroup(inviteToken.trim())
      setInviteToken('')
      setShowJoin(false)
      fetchGroups()
      navigate(`/groups/${result.id}`)
      toast.success(t('joinGroup.success'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('joinGroup.error'))
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // If user has exactly one group, redirect to it
  useEffect(() => {
    if (!loading && groups.length === 1 && groups[0]) {
      navigate(`/groups/${groups[0].id}`, { replace: true })
    }
  }, [loading, groups, navigate])

  return (
    <div className="min-h-screen bg-background">
      <AppHeader>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <Avatar>
                <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                <AvatarFallback>{user.displayName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{user.displayName}</span>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t('groups.logout')}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </AppHeader>

      <main className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{t('groups.title')}</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowJoin(true)}>
              <LogIn className="w-4 h-4" />
              {t('groups.join')}
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              {t('groups.create')}
            </Button>
          </div>
        </div>

        {/* Create Group Dialog */}
        <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setInviteResult(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createGroup.title')}</DialogTitle>
              <DialogDescription>{t('createGroup.description')}</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 mt-4">
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t('createGroup.placeholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                maxLength={100}
                autoFocus
              />
              <Button onClick={handleCreate}>{t('createGroup.submit')}</Button>
            </div>
            {inviteResult && <InviteLink token={inviteResult} />}
          </DialogContent>
        </Dialog>

        {/* Join Group Dialog */}
        <Dialog open={showJoin} onOpenChange={setShowJoin}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('joinGroup.title')}</DialogTitle>
              <DialogDescription>{t('joinGroup.description')}</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 mt-4">
              <Input
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder={t('joinGroup.placeholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={128}
                autoFocus
              />
              <Button onClick={handleJoin}>{t('joinGroup.submit')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Groups List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">{t('groups.noGroups')}</h3>
            <p className="text-muted-foreground mb-6">{t('groups.noGroupsHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <Link key={group.id} to={`/groups/${group.id}`} className="block">
                <Card className="p-4 hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{group.name}</h3>
                      <p className="text-sm text-muted-foreground">{group.role}</p>
                    </div>
                    <Gamepad2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
