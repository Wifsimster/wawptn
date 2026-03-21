import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Users, BarChart3, Save, RefreshCw, ShieldCheck, ShieldOff, Theater, Plus, Pencil, Trash2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'

interface BotSettings {
  persona_rotation_enabled: boolean
  friday_schedule: string
  wednesday_schedule: string
  schedule_timezone: string
  disabled_personas: string[]
  announce_persona_change: boolean
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

interface AdminPersona {
  id: string
  name: string
  systemPromptOverlay: string
  fridayMessages: string[]
  weekdayMessages: string[]
  backOnlineMessages: string[]
  emptyMentionReply: string
  introMessage: string
  embedColor: number
  isActive: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

interface PersonaFormData {
  id: string
  name: string
  systemPromptOverlay: string
  fridayMessages: string
  weekdayMessages: string
  backOnlineMessages: string
  emptyMentionReply: string
  introMessage: string
  embedColor: string
}

const EMPTY_FORM: PersonaFormData = {
  id: '',
  name: '',
  systemPromptOverlay: '',
  fridayMessages: '',
  weekdayMessages: '',
  backOnlineMessages: '',
  emptyMentionReply: '',
  introMessage: '',
  embedColor: '#5865F2',
}

function colorIntToHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0').toUpperCase()
}

function colorHexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function linesToArray(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
}

function arrayToLines(arr: string[]): string {
  return arr.join('\n')
}

export function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<BotSettings | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [personas, setPersonas] = useState<AdminPersona[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PersonaFormData>(EMPTY_FORM)
  const [formSaving, setFormSaving] = useState(false)

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingPersonaId, setDeletingPersonaId] = useState<string | null>(null)

  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/')
      return
    }
    loadData()
  }, [user, navigate])

  const loadData = useCallback(async () => {
    try {
      const [settingsData, statsData, usersData, personasData] = await Promise.all([
        api.getAdminBotSettings(),
        api.getAdminStats(),
        api.getAdminUsers(),
        api.getAdminPersonas(),
      ])
      const s = settingsData as unknown as BotSettings
      // Ensure disabled_personas is always an array
      if (!Array.isArray(s.disabled_personas)) s.disabled_personas = []
      setSettings(s)
      setStats(statsData)
      setUsers(usersData)
      setPersonas(personasData)
    } catch {
      toast.error('Erreur lors du chargement des données admin')
    } finally {
      setLoading(false)
    }
  }, [])

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

  async function handleToggleAdmin(targetUser: AdminUser) {
    const newIsAdmin = !targetUser.isAdmin
    try {
      await api.setAdminUserRole(targetUser.id, newIsAdmin)
      setUsers(users.map(u => u.id === targetUser.id ? { ...u, isAdmin: newIsAdmin } : u))
      toast.success(newIsAdmin ? `${targetUser.displayName} promu admin` : `${targetUser.displayName} n'est plus admin`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de rôle')
    }
  }

  async function handleTogglePersona(personaId: string) {
    try {
      const result = await api.toggleAdminPersona(personaId)
      setPersonas(personas.map(p => p.id === personaId ? { ...p, isActive: result.isActive } : p))
      toast.success(result.isActive ? 'Persona activé' : 'Persona désactivé')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du basculement')
    }
  }

  function openCreateDialog() {
    setDialogMode('create')
    setEditingPersonaId(null)
    setFormData(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEditDialog(persona: AdminPersona) {
    setDialogMode('edit')
    setEditingPersonaId(persona.id)
    setFormData({
      id: persona.id,
      name: persona.name,
      systemPromptOverlay: persona.systemPromptOverlay,
      fridayMessages: arrayToLines(persona.fridayMessages),
      weekdayMessages: arrayToLines(persona.weekdayMessages),
      backOnlineMessages: arrayToLines(persona.backOnlineMessages),
      emptyMentionReply: persona.emptyMentionReply,
      introMessage: persona.introMessage,
      embedColor: colorIntToHex(persona.embedColor),
    })
    setDialogOpen(true)
  }

  async function handleFormSubmit() {
    // Validate
    if (!formData.name.trim()) {
      toast.error('Le nom est requis')
      return
    }
    if (dialogMode === 'create' && !formData.id.trim()) {
      toast.error("L'identifiant est requis")
      return
    }

    const fridayMessages = linesToArray(formData.fridayMessages)
    const weekdayMessages = linesToArray(formData.weekdayMessages)
    const backOnlineMessages = linesToArray(formData.backOnlineMessages)

    if (fridayMessages.length === 0 || weekdayMessages.length === 0 || backOnlineMessages.length === 0) {
      toast.error('Chaque catégorie de messages doit contenir au moins un message')
      return
    }

    setFormSaving(true)
    try {
      if (dialogMode === 'create') {
        await api.createAdminPersona({
          id: formData.id.trim(),
          name: formData.name.trim(),
          systemPromptOverlay: formData.systemPromptOverlay,
          fridayMessages,
          weekdayMessages,
          backOnlineMessages,
          emptyMentionReply: formData.emptyMentionReply,
          introMessage: formData.introMessage,
          embedColor: colorHexToInt(formData.embedColor),
        })
        toast.success('Persona créé')
      } else {
        await api.updateAdminPersona(editingPersonaId!, {
          name: formData.name.trim(),
          systemPromptOverlay: formData.systemPromptOverlay,
          fridayMessages,
          weekdayMessages,
          backOnlineMessages,
          emptyMentionReply: formData.emptyMentionReply,
          introMessage: formData.introMessage,
          embedColor: colorHexToInt(formData.embedColor),
        })
        toast.success('Persona mis à jour')
      }
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setFormSaving(false)
    }
  }

  async function handleDeletePersona() {
    if (!deletingPersonaId) return
    try {
      await api.deleteAdminPersona(deletingPersonaId)
      setPersonas(personas.filter(p => p.id !== deletingPersonaId))
      toast.success('Persona supprimé')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeleteDialogOpen(false)
      setDeletingPersonaId(null)
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

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="announce-persona-change"
                    checked={settings.announce_persona_change}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, announce_persona_change: checked === true })
                    }
                    disabled={!settings.persona_rotation_enabled}
                  />
                  <label htmlFor="announce-persona-change" className={`text-sm font-medium cursor-pointer ${!settings.persona_rotation_enabled ? 'text-muted-foreground' : ''}`}>
                    Annoncer le changement de persona à minuit
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

        {/* Personas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Theater className="h-5 w-5" />
                Personas ({personas.length})
              </CardTitle>
              <Button size="sm" className="gap-1.5" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Ajouter un persona
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    className="flex items-center gap-3 rounded-md border border-border p-3"
                  >
                    <Checkbox
                      id={`persona-${persona.id}`}
                      checked={persona.isActive}
                      onCheckedChange={() => handleTogglePersona(persona.id)}
                    />
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: colorIntToHex(persona.embedColor) }}
                    />
                    <label
                      htmlFor={`persona-${persona.id}`}
                      className={`text-sm font-medium cursor-pointer flex-1 ${!persona.isActive ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {persona.name}
                    </label>
                    {persona.isDefault && (
                      <span title="Persona par défaut"><Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /></span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => openEditDialog(persona)}
                      title="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!persona.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeletingPersonaId(persona.id)
                          setDeleteDialogOpen(true)
                        }}
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Cochez/décochez pour activer ou désactiver un persona dans la rotation.
                  Les personas avec un cadenas sont les personas par défaut et ne peuvent pas être supprimés.
                </p>
              </div>
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
                    {u.isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => handleToggleAdmin(u)}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? 'Vous ne pouvez pas révoquer votre propre accès' : undefined}
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                        Révoquer
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleToggleAdmin(u)}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Promouvoir
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create/Edit Persona Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Ajouter un persona' : 'Modifier le persona'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? 'Créez un nouveau persona pour le bot Discord.'
                : `Modification de "${formData.name}"`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {dialogMode === 'create' && (
              <div className="space-y-1.5">
                <label htmlFor="persona-id" className="text-sm font-medium">Identifiant</label>
                <Input
                  id="persona-id"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="mon-persona (kebab-case)"
                />
                <p className="text-xs text-muted-foreground">Identifiant unique en kebab-case, non modifiable</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="persona-name" className="text-sm font-medium">Nom</label>
              <Input
                id="persona-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Le Nouveau Persona"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-color" className="text-sm font-medium">Couleur de l'embed</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="persona-color"
                  value={formData.embedColor}
                  onChange={(e) => setFormData({ ...formData, embedColor: e.target.value })}
                  className="w-10 h-10 rounded border border-input cursor-pointer"
                />
                <Input
                  value={formData.embedColor}
                  onChange={(e) => setFormData({ ...formData, embedColor: e.target.value })}
                  placeholder="#5865F2"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-system-prompt" className="text-sm font-medium">System prompt overlay</label>
              <Textarea
                id="persona-system-prompt"
                value={formData.systemPromptOverlay}
                onChange={(e) => setFormData({ ...formData, systemPromptOverlay: e.target.value })}
                placeholder="Ta personnalité :&#10;- Tu es..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">Injecté dans le prompt système du LLM pour définir la personnalité</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-intro" className="text-sm font-medium">Message d'introduction</label>
              <Input
                id="persona-intro"
                value={formData.introMessage}
                onChange={(e) => setFormData({ ...formData, introMessage: e.target.value })}
                placeholder="Message envoyé à minuit lors du changement de persona"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-empty-mention" className="text-sm font-medium">Réponse mention vide</label>
              <Input
                id="persona-empty-mention"
                value={formData.emptyMentionReply}
                onChange={(e) => setFormData({ ...formData, emptyMentionReply: e.target.value })}
                placeholder="Réponse quand quelqu'un mentionne le bot sans message"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-friday" className="text-sm font-medium">Messages vendredi</label>
              <Textarea
                id="persona-friday"
                value={formData.fridayMessages}
                onChange={(e) => setFormData({ ...formData, fridayMessages: e.target.value })}
                placeholder="Un message par ligne"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">Un message par ligne. Un sera choisi au hasard chaque vendredi.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-weekday" className="text-sm font-medium">Messages semaine</label>
              <Textarea
                id="persona-weekday"
                value={formData.weekdayMessages}
                onChange={(e) => setFormData({ ...formData, weekdayMessages: e.target.value })}
                placeholder="Un message par ligne"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">Un message par ligne. Un sera choisi au hasard en semaine.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="persona-backonline" className="text-sm font-medium">Messages retour en ligne</label>
              <Textarea
                id="persona-backonline"
                value={formData.backOnlineMessages}
                onChange={(e) => setFormData({ ...formData, backOnlineMessages: e.target.value })}
                placeholder="Un message par ligne"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Un message par ligne. Envoyé quand le bot revient en ligne.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleFormSubmit} disabled={formSaving}>
              {formSaving ? 'Sauvegarde...' : dialogMode === 'create' ? 'Créer' : 'Sauvegarder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le persona</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce persona ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeletePersona}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
