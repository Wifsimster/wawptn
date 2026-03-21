import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Users, BarChart3, Save, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'

interface BotSettings {
  persona_rotation_enabled: boolean
  friday_schedule: string
  wednesday_schedule: string
  schedule_timezone: string
}

interface AdminStats {
  users: number
  groups: number
  votingSessions: number
}

interface AdminUser {
  id: string
  steamId: string
  displayName: string
  avatarUrl: string
  isAdmin: boolean
  createdAt: string
}

export function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<BotSettings | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/')
      return
    }
    loadData()
  }, [user, navigate])

  async function loadData() {
    try {
      const [settingsData, statsData, usersData] = await Promise.all([
        api.getAdminBotSettings(),
        api.getAdminStats(),
        api.getAdminUsers(),
      ])
      setSettings(settingsData as unknown as BotSettings)
      setStats(statsData)
      setUsers(usersData)
    } catch {
      toast.error('Erreur lors du chargement des données admin')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      await api.updateAdminBotSettings(settings as unknown as Record<string, unknown>)
      toast.success('Paramètres sauvegardés')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (!user?.isAdmin) return null

  return (
    <div className="min-h-screen bg-background">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="mx-auto max-w-2xl px-4 py-6 space-y-6" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Administration</h1>
          <Badge variant="outline">Admin</Badge>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : stats && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.users}</div>
                <div className="text-xs text-muted-foreground">Utilisateurs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <BarChart3 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.groups}</div>
                <div className="text-xs text-muted-foreground">Groupes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Bot className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.votingSessions}</div>
                <div className="text-xs text-muted-foreground">Sessions de vote</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bot Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Paramètres du bot Discord
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : settings && (
              <>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="persona-rotation"
                    checked={settings.persona_rotation_enabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, persona_rotation_enabled: checked === true })
                    }
                  />
                  <label htmlFor="persona-rotation" className="text-sm font-medium cursor-pointer">
                    Rotation des personas activée
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="friday-schedule" className="text-sm font-medium">
                    Rappel vendredi (cron)
                  </label>
                  <Input
                    id="friday-schedule"
                    value={settings.friday_schedule}
                    onChange={(e) => setSettings({ ...settings, friday_schedule: e.target.value })}
                    placeholder="0 21 * * 5"
                  />
                  <p className="text-xs text-muted-foreground">Expression cron pour le rappel du vendredi soir</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="wednesday-schedule" className="text-sm font-medium">
                    Rappel semaine (cron)
                  </label>
                  <Input
                    id="wednesday-schedule"
                    value={settings.wednesday_schedule}
                    onChange={(e) => setSettings({ ...settings, wednesday_schedule: e.target.value })}
                    placeholder="0 17 * * 3"
                  />
                  <p className="text-xs text-muted-foreground">Expression cron pour le rappel en semaine</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="timezone" className="text-sm font-medium">
                    Fuseau horaire
                  </label>
                  <Input
                    id="timezone"
                    value={settings.schedule_timezone}
                    onChange={(e) => setSettings({ ...settings, schedule_timezone: e.target.value })}
                    placeholder="Europe/Paris"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </Button>
                  <Button variant="outline" onClick={loadData} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Recharger
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Utilisateurs ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.avatarUrl} alt={u.displayName} />
                      <AvatarFallback>{u.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        Inscrit le {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    {u.isAdmin && (
                      <Badge variant="default">Admin</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
