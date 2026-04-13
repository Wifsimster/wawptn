import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bot, Users, BarChart3, Save, RefreshCw, ShieldCheck,
  ShieldOff, Theater, Plus, Pencil, Trash2, Lock, Search, X,
  Activity, Zap, Clock, Globe, Terminal, Megaphone, Send,
  ChevronLeft, ChevronRight, Crown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
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
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────── */

interface BotSettings {
  persona_rotation_enabled: boolean
  friday_schedule: string
  wednesday_schedule: string
  schedule_timezone: string
  disabled_personas: string[]
  announce_persona_change: boolean
  persona_override: string | null
}

interface AdminStats {
  users: number
  admins: number
  groups: number
  votingSessions: number
}

const USERS_PAGE_SIZE = 25

interface AdminUser {
  id: string
  steamId: string
  displayName: string
  avatarUrl: string
  isAdmin: boolean
  isPremium: boolean
  adminGrantedPremium: boolean
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

type AdminTab = 'overview' | 'bot' | 'personas' | 'users' | 'notifications'

const TABS: { id: AdminTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: Activity },
  { id: 'notifications', label: 'Annonces', icon: Megaphone },
  { id: 'bot', label: 'Bot Discord', icon: Bot },
  { id: 'personas', label: 'Personas', icon: Theater },
  { id: 'users', label: 'Utilisateurs', icon: Users },
]

/* ─── Helpers ───────────────────────────────────────── */

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

/* ─── Animated counter ──────────────────────────────── */

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<number>(0)

  useEffect(() => {
    const start = ref.current
    const diff = value - start
    if (diff === 0) return
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(start + diff * eased)
      setDisplay(current)
      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        ref.current = value
      }
    }

    requestAnimationFrame(tick)
  }, [value, duration])

  return <>{display.toLocaleString('fr-FR')}</>
}

/* ─── Motion variants ───────────────────────────────── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
}

const tabContent: Variants = {
  enter: { opacity: 0, x: 12 },
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    x: -12,
    transition: { duration: 0.2 },
  },
}

/* ─── Main component ────────────────────────────────── */

export function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [settings, setSettings] = useState<BotSettings | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [personas, setPersonas] = useState<AdminPersona[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Users pagination + search
  const [userSearch, setUserSearch] = useState('')
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('')
  const [usersOffset, setUsersOffset] = useState(0)
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersLoading, setUsersLoading] = useState(false)
  const usersRequestId = useRef(0)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PersonaFormData>(EMPTY_FORM)
  const [formSaving, setFormSaving] = useState(false)

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingPersonaId, setDeletingPersonaId] = useState<string | null>(null)

  const loadUsers = useCallback(async (offset: number, q: string) => {
    const requestId = ++usersRequestId.current
    setUsersLoading(true)
    try {
      const res = await api.getAdminUsers({ limit: USERS_PAGE_SIZE, offset, q: q || undefined })
      // Drop stale responses if a newer request has fired
      if (requestId !== usersRequestId.current) return
      setUsers(res.data)
      setUsersTotal(res.total)
      setUsersOffset(res.offset)
    } catch {
      if (requestId === usersRequestId.current) {
        toast.error('Erreur lors du chargement des utilisateurs')
      }
    } finally {
      if (requestId === usersRequestId.current) {
        setUsersLoading(false)
      }
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [settingsData, statsData, personasData] = await Promise.all([
        api.getAdminBotSettings(),
        api.getAdminStats(),
        api.getAdminPersonas(),
      ])
      const s = settingsData as unknown as BotSettings
      if (!Array.isArray(s.disabled_personas)) s.disabled_personas = []
      if (s.persona_override === undefined) s.persona_override = null
      setSettings(s)
      setStats(statsData)
      setPersonas(personasData)
    } catch {
      toast.error('Erreur lors du chargement des données admin')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(() => {
    void loadData()
    void loadUsers(usersOffset, debouncedUserSearch)
  }, [loadData, loadUsers, usersOffset, debouncedUserSearch])

  // Debounce user search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 250)
    return () => clearTimeout(timer)
  }, [userSearch])

  // Re-fetch first page whenever the debounced search changes (skip initial mount —
  // the user-load effect below already fetches page 0 with an empty query).
  const isFirstSearch = useRef(true)
  useEffect(() => {
    if (isFirstSearch.current) {
      isFirstSearch.current = false
      return
    }
    void loadUsers(0, debouncedUserSearch)
  }, [debouncedUserSearch, loadUsers])

  useEffect(() => {
    if (user && !user.isAdmin) {
      navigate('/')
      return
    }
    void loadData()
    void loadUsers(0, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate])

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
      setUsers(users.map(u => u.id === targetUser.id ? {
        ...u,
        isAdmin: newIsAdmin,
        // Admins implicitly have premium access
        isPremium: newIsAdmin ? true : u.adminGrantedPremium,
      } : u))
      // Keep the overview admin count in sync without refetching the full page
      setStats(prev => prev ? { ...prev, admins: prev.admins + (newIsAdmin ? 1 : -1) } : prev)
      toast.success(newIsAdmin ? `${targetUser.displayName} promu admin` : `${targetUser.displayName} n'est plus admin`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de rôle')
    }
  }

  async function handleTogglePremium(targetUser: AdminUser) {
    const newGranted = !targetUser.adminGrantedPremium
    try {
      await api.setAdminUserPremium(targetUser.id, newGranted)
      setUsers(users.map(u => u.id === targetUser.id ? {
        ...u,
        adminGrantedPremium: newGranted,
        // Admins keep premium regardless; otherwise reflect the grant
        isPremium: u.isAdmin ? true : newGranted,
      } : u))
      toast.success(newGranted
        ? `${targetUser.displayName} a reçu l'accès premium`
        : `Accès premium retiré à ${targetUser.displayName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement du statut premium')
    }
  }

  const handleUsersPrev = useCallback(() => {
    const next = Math.max(0, usersOffset - USERS_PAGE_SIZE)
    void loadUsers(next, debouncedUserSearch)
  }, [usersOffset, debouncedUserSearch, loadUsers])

  const handleUsersNext = useCallback(() => {
    const next = usersOffset + USERS_PAGE_SIZE
    if (next >= usersTotal) return
    void loadUsers(next, debouncedUserSearch)
  }, [usersOffset, usersTotal, debouncedUserSearch, loadUsers])

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

  const activePersonas = personas.filter(p => p.isActive).length

  if (!user?.isAdmin) return null

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader maxWidth="wide">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </AppHeader>

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-8 space-y-8"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {/* ── Header ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-end justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Centre de contrôle
              </h1>
              <Badge className="admin-badge text-[10px] uppercase tracking-widest font-mono px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20">
                Admin
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              <Terminal className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Tableau de bord administrateur
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-2 shrink-0"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
        </motion.div>

        {/* ── Tab navigation ─────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="admin-tabs relative"
        >
          <div className="flex gap-1 p-1 rounded-xl bg-card/50 border border-white/[0.04] backdrop-blur-sm">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex-1 justify-center',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/70',
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="admin-tab-bg"
                      className="absolute inset-0 rounded-lg bg-primary/[0.08] border border-primary/15"
                      style={{ boxShadow: '0 0 20px oklch(0.55 0.27 270 / 0.06)' }}
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10 hidden sm:inline">{tab.label}</span>
                  {tab.id === 'personas' && personas.length > 0 && (
                    <span className="relative z-10 hidden sm:inline text-[10px] font-mono text-muted-foreground">
                      {activePersonas}/{personas.length}
                    </span>
                  )}
                  {tab.id === 'users' && stats && stats.users > 0 && (
                    <span className="relative z-10 hidden sm:inline text-[10px] font-mono text-muted-foreground">
                      {stats.users}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* ── Tab content ────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              variants={tabContent}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <OverviewTab
                stats={stats}
                loading={loading}
                usersLoading={usersLoading}
                personas={personas}
                users={users}
              />
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div
              key="notifications"
              variants={tabContent}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <NotificationsTab />
            </motion.div>
          )}

          {activeTab === 'bot' && (
            <motion.div
              key="bot"
              variants={tabContent}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <BotSettingsTab
                settings={settings}
                loading={loading}
                saving={saving}
                personas={personas}
                onSettingsChange={setSettings}
                onSave={handleSave}
              />
            </motion.div>
          )}

          {activeTab === 'personas' && (
            <motion.div
              key="personas"
              variants={tabContent}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <PersonasTab
                personas={personas}
                loading={loading}
                onToggle={handleTogglePersona}
                onEdit={openEditDialog}
                onDelete={(id) => {
                  setDeletingPersonaId(id)
                  setDeleteDialogOpen(true)
                }}
                onCreate={openCreateDialog}
              />
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div
              key="users"
              variants={tabContent}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <UsersTab
                users={users}
                totalUsers={usersTotal}
                offset={usersOffset}
                pageSize={USERS_PAGE_SIZE}
                loading={usersLoading}
                currentUserId={user?.id}
                searchQuery={userSearch}
                onSearchChange={setUserSearch}
                onPrev={handleUsersPrev}
                onNext={handleUsersNext}
                onToggleAdmin={handleToggleAdmin}
                onTogglePremium={handleTogglePremium}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Create/Edit Persona Dialog ──────────────── */}
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

      {/* ── Delete Confirmation Dialog ──────────────── */}
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
      <AppFooter />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   TAB: Notifications
   ═══════════════════════════════════════════════════════ */

function NotificationsTab() {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!title.trim()) return
    setSending(true)
    try {
      const result = await api.broadcastNotification(title.trim(), body.trim() || undefined)
      toast.success(t('notifications.broadcastSuccess', { count: result.recipientCount }))
      setTitle('')
      setBody('')
    } catch {
      toast.error(t('notifications.broadcastError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4" />
            {t('notifications.broadcastTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="broadcast-title" className="text-sm font-medium">
              {t('notifications.broadcastTitleLabel')}
            </label>
            <Input
              id="broadcast-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('notifications.broadcastTitlePlaceholder')}
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="broadcast-body" className="text-sm font-medium">
              {t('notifications.broadcastBodyLabel')}
            </label>
            <Textarea
              id="broadcast-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('notifications.broadcastBodyPlaceholder')}
              rows={3}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!title.trim() || sending}
            className="w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            {sending ? '...' : t('notifications.broadcastSend')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   TAB: Overview
   ═══════════════════════════════════════════════════════ */

function OverviewTab({
  stats,
  loading,
  usersLoading,
  personas,
  users,
}: {
  stats: AdminStats | null
  loading: boolean
  usersLoading: boolean
  personas: AdminPersona[]
  users: AdminUser[]
}) {
  const adminCount = stats?.admins ?? 0
  const activePersonas = personas.filter(p => p.isActive).length

  const statCards = [
    {
      label: 'Utilisateurs',
      value: stats?.users ?? 0,
      icon: Users,
      accent: 'neon' as const,
      detail: `dont ${adminCount} admin${adminCount > 1 ? 's' : ''}`,
    },
    {
      label: 'Groupes',
      value: stats?.groups ?? 0,
      icon: Zap,
      accent: 'primary' as const,
      detail: null,
    },
    {
      label: 'Sessions de vote',
      value: stats?.votingSessions ?? 0,
      icon: BarChart3,
      accent: 'ember' as const,
      detail: null,
    },
    {
      label: 'Personas actifs',
      value: activePersonas,
      icon: Theater,
      accent: 'success' as const,
      detail: `sur ${personas.length} total`,
    },
  ]

  return (
    <div className="space-y-8">
      {/* ── Stat cards grid ── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {loading
          ? [1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))
          : statCards.map((card) => {
            const Icon = card.icon
            const colorMap = {
              neon: {
                ring: 'border-neon/15 hover:border-neon/30',
                glow: '0 0 24px oklch(0.82 0.19 190 / 0.08)',
                iconBg: 'bg-neon/10',
                iconColor: 'text-neon',
                valueColor: 'text-neon',
              },
              primary: {
                ring: 'border-primary/15 hover:border-primary/30',
                glow: '0 0 24px oklch(0.55 0.27 270 / 0.08)',
                iconBg: 'bg-primary/10',
                iconColor: 'text-primary',
                valueColor: 'text-primary',
              },
              ember: {
                ring: 'border-ember/15 hover:border-ember/30',
                glow: '0 0 24px oklch(0.72 0.18 50 / 0.08)',
                iconBg: 'bg-ember/10',
                iconColor: 'text-ember',
                valueColor: 'text-ember',
              },
              success: {
                ring: 'border-success/15 hover:border-success/30',
                glow: '0 0 24px oklch(0.723 0.191 142.5 / 0.08)',
                iconBg: 'bg-success/10',
                iconColor: 'text-success',
                valueColor: 'text-success',
              },
            }
            const c = colorMap[card.accent]

            return (
              <motion.div key={card.label} variants={fadeUp}>
                <div
                  className={cn(
                    'group relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm p-5 transition-all duration-500',
                    c.ring,
                  )}
                  style={{ boxShadow: c.glow }}
                >
                  {/* Background glow orb */}
                  <div
                    className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.04] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.08]"
                    style={{
                      background: card.accent === 'neon'
                        ? 'oklch(0.82 0.19 190)'
                        : card.accent === 'primary'
                          ? 'oklch(0.55 0.27 270)'
                          : card.accent === 'ember'
                            ? 'oklch(0.72 0.18 50)'
                            : 'oklch(0.723 0.191 142.5)',
                    }}
                  />

                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', c.iconBg)}>
                    <Icon className={cn('h-4.5 w-4.5', c.iconColor)} />
                  </div>
                  <div className={cn('text-3xl font-heading font-bold tracking-tight', c.valueColor)}>
                    <AnimatedNumber value={card.value} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-medium">
                    {card.label}
                  </div>
                  {card.detail && (
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
                      {card.detail}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
      </motion.div>

      {/* ── Recent activity grid ── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid gap-4 lg:grid-cols-2"
      >
        {/* Personas overview */}
        <motion.div variants={fadeUp}>
          <Card className="bg-card/60 backdrop-blur-sm border-white/[0.04]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Theater className="h-4 w-4" />
                Personas en rotation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {personas.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors',
                        p.isActive
                          ? 'bg-white/[0.02]'
                          : 'opacity-40',
                      )}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
                        style={{
                          backgroundColor: colorIntToHex(p.embedColor),
                          '--tw-ring-color': colorIntToHex(p.embedColor) + '40',
                        } as React.CSSProperties}
                      />
                      <span className="text-sm truncate flex-1">{p.name}</span>
                      {p.isDefault && (
                        <Lock className="h-3 w-3 text-muted-foreground/50" />
                      )}
                      <span className={cn(
                        'text-[10px] font-mono uppercase tracking-wider',
                        p.isActive ? 'text-success' : 'text-muted-foreground',
                      )}>
                        {p.isActive ? 'actif' : 'inactif'}
                      </span>
                    </div>
                  ))}
                  {personas.length > 6 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center pt-1 font-mono">
                      +{personas.length - 6} de plus
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent users */}
        <motion.div variants={fadeUp}>
          <Card className="bg-card/60 backdrop-blur-sm border-white/[0.04]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Derniers inscrits
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {users.slice(0, 5).map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02]"
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={u.avatarUrl} alt={u.displayName} />
                          <AvatarFallback className="text-[10px]">{u.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate flex-1">{u.displayName}</span>
                        {u.isAdmin && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/20 text-primary">
                            admin
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                          {new Date(u.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   TAB: Bot Settings
   ═══════════════════════════════════════════════════════ */

function BotSettingsTab({
  settings,
  loading,
  saving,
  personas,
  onSettingsChange,
  onSave,
}: {
  settings: BotSettings | null
  loading: boolean
  saving: boolean
  personas: AdminPersona[]
  onSettingsChange: (s: BotSettings) => void
  onSave: () => void
}) {
  const activePersonas = personas.filter(p => p.isActive)
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="max-w-2xl space-y-6"
    >
      {/* Persona rotation */}
      <motion.div variants={fadeUp}>
        <Card className="bg-card/60 backdrop-blur-sm border-white/[0.04] overflow-hidden">
          <div className="h-[2px] bg-gradient-to-r from-primary/40 via-neon/30 to-transparent" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              Rotation des personas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map(i => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : settings && (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                  <Checkbox
                    id="persona-rotation"
                    checked={settings.persona_rotation_enabled}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, persona_rotation_enabled: checked === true })
                    }
                  />
                  <label htmlFor="persona-rotation" className="text-sm font-medium cursor-pointer flex-1">
                    Rotation des personas activée
                  </label>
                  <div className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    settings.persona_rotation_enabled ? 'bg-success' : 'bg-muted-foreground/30',
                  )} />
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                  <Checkbox
                    id="announce-persona-change"
                    checked={settings.announce_persona_change}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ ...settings, announce_persona_change: checked === true })
                    }
                    disabled={!settings.persona_rotation_enabled}
                  />
                  <label
                    htmlFor="announce-persona-change"
                    className={cn(
                      'text-sm font-medium cursor-pointer flex-1',
                      !settings.persona_rotation_enabled && 'text-muted-foreground',
                    )}
                  >
                    Annoncer le changement de persona à minuit
                  </label>
                </div>

                {/* Persona override */}
                <div className="space-y-2 pt-2">
                  <label htmlFor="persona-override" className="text-sm font-medium flex items-center gap-1.5">
                    <Theater className="h-3.5 w-3.5 text-muted-foreground" />
                    Forcer le persona du jour
                  </label>
                  <select
                    id="persona-override"
                    value={settings.persona_override ?? ''}
                    onChange={(e) =>
                      onSettingsChange({ ...settings, persona_override: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Automatique (rotation)</option>
                    {activePersonas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground/60">
                    {settings.persona_override
                      ? 'Le persona sélectionné sera utilisé à la place de la rotation automatique.'
                      : 'La rotation automatique sélectionne le persona en fonction du jour.'}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Schedules */}
      <motion.div variants={fadeUp}>
        <Card className="bg-card/60 backdrop-blur-sm border-white/[0.04] overflow-hidden">
          <div className="h-[2px] bg-gradient-to-r from-ember/40 via-reward/30 to-transparent" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="w-8 h-8 rounded-lg bg-ember/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-ember" />
              </div>
              Planification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : settings && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="friday-schedule" className="text-sm font-medium flex items-center gap-1.5">
                    Rappel vendredi
                    <span className="text-[10px] font-mono text-muted-foreground/50 bg-white/[0.03] px-1.5 py-0.5 rounded">cron</span>
                  </label>
                  <Input
                    id="friday-schedule"
                    value={settings.friday_schedule}
                    onChange={(e) => onSettingsChange({ ...settings, friday_schedule: e.target.value })}
                    placeholder="0 21 * * 5"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground/60">Expression cron pour le rappel du vendredi soir</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="wednesday-schedule" className="text-sm font-medium flex items-center gap-1.5">
                    Rappel semaine
                    <span className="text-[10px] font-mono text-muted-foreground/50 bg-white/[0.03] px-1.5 py-0.5 rounded">cron</span>
                  </label>
                  <Input
                    id="wednesday-schedule"
                    value={settings.wednesday_schedule}
                    onChange={(e) => onSettingsChange({ ...settings, wednesday_schedule: e.target.value })}
                    placeholder="0 17 * * 3"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground/60">Expression cron pour le rappel en semaine</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="timezone" className="text-sm font-medium flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    Fuseau horaire
                  </label>
                  <Input
                    id="timezone"
                    value={settings.schedule_timezone}
                    onChange={(e) => onSettingsChange({ ...settings, schedule_timezone: e.target.value })}
                    placeholder="Europe/Paris"
                    className="font-mono text-sm"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Save bar */}
      <motion.div variants={fadeUp} className="flex gap-3 pt-2">
        <Button onClick={onSave} disabled={saving || loading} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
        </Button>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════
   TAB: Personas
   ═══════════════════════════════════════════════════════ */

function PersonasTab({
  personas,
  loading,
  onToggle,
  onEdit,
  onDelete,
  onCreate,
}: {
  personas: AdminPersona[]
  loading: boolean
  onToggle: (id: string) => void
  onEdit: (persona: AdminPersona) => void
  onDelete: (id: string) => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {personas.filter(p => p.isActive).length} actif{personas.filter(p => p.isActive).length > 1 ? 's' : ''} sur {personas.length}
        </div>
        <Button size="sm" className="gap-1.5" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Ajouter un persona
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {personas.map((persona) => (
            <motion.div key={persona.id} variants={scaleIn}>
              <div
                className={cn(
                  'group relative rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-300',
                  persona.isActive
                    ? 'border-white/[0.06] hover:border-white/[0.12]'
                    : 'border-white/[0.03] opacity-50 hover:opacity-70',
                )}
              >
                {/* Color stripe top */}
                <div
                  className="h-1 w-full transition-all duration-300"
                  style={{
                    background: `linear-gradient(90deg, ${colorIntToHex(persona.embedColor)}, ${colorIntToHex(persona.embedColor)}80, transparent)`,
                    opacity: persona.isActive ? 1 : 0.4,
                  }}
                />

                <div className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-card"
                        style={{
                          backgroundColor: colorIntToHex(persona.embedColor),
                          boxShadow: persona.isActive
                            ? `0 0 12px ${colorIntToHex(persona.embedColor)}40`
                            : 'none',
                        }}
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{persona.name}</h3>
                        <p className="text-[10px] font-mono text-muted-foreground/50 truncate">{persona.id}</p>
                      </div>
                    </div>
                    {persona.isDefault && (
                      <span title="Persona par défaut">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
                      </span>
                    )}
                  </div>

                  {/* Preview */}
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {persona.systemPromptOverlay || persona.introMessage || 'Aucune description'}
                  </p>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
                    <span>{persona.fridayMessages.length} msg vendredi</span>
                    <span className="text-white/10">|</span>
                    <span>{persona.weekdayMessages.length} msg semaine</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                    <Checkbox
                      id={`persona-${persona.id}`}
                      checked={persona.isActive}
                      onCheckedChange={() => onToggle(persona.id)}
                    />
                    <label
                      htmlFor={`persona-${persona.id}`}
                      className="text-[11px] cursor-pointer flex-1 text-muted-foreground"
                    >
                      {persona.isActive ? 'Actif' : 'Inactif'}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onEdit(persona)}
                      title="Modifier"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {!persona.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDelete(persona.id)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <p className="text-xs text-muted-foreground/40 pt-2">
        Cochez/décochez pour activer ou désactiver un persona dans la rotation.
        Les personas avec un cadenas sont les personas par défaut et ne peuvent pas être supprimés.
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   TAB: Users
   ═══════════════════════════════════════════════════════ */

function UsersTab({
  users,
  totalUsers,
  offset,
  pageSize,
  loading,
  currentUserId,
  searchQuery,
  onSearchChange,
  onPrev,
  onNext,
  onToggleAdmin,
  onTogglePremium,
}: {
  users: AdminUser[]
  totalUsers: number
  offset: number
  pageSize: number
  loading: boolean
  currentUserId: string | undefined
  searchQuery: string
  onSearchChange: (q: string) => void
  onPrev: () => void
  onNext: () => void
  onToggleAdmin: (user: AdminUser) => void
  onTogglePremium: (user: AdminUser) => void
}) {
  const rangeStart = totalUsers === 0 ? 0 : offset + 1
  const rangeEnd = Math.min(offset + users.length, totalUsers)
  const canPrev = offset > 0
  const canNext = offset + pageSize < totalUsers

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un utilisateur..."
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground/50">
          {totalUsers === 0
            ? '0 utilisateur'
            : rangeStart === rangeEnd
              ? `${rangeStart} sur ${totalUsers}`
              : `${rangeStart}–${rangeEnd} sur ${totalUsers}`}
        </span>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="space-y-2"
        >
          {users.map((u) => (
            <motion.div key={u.id} variants={fadeUp}>
              <div className={cn(
                'flex items-center gap-4 rounded-xl border bg-card/60 backdrop-blur-sm p-4 transition-all duration-300',
                u.isAdmin
                  ? 'border-primary/10 hover:border-primary/20'
                  : 'border-white/[0.04] hover:border-white/[0.08]',
              )}>
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatarUrl} alt={u.displayName} />
                    <AvatarFallback>{u.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {u.isAdmin && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary/20 border border-card flex items-center justify-center">
                      <ShieldCheck className="h-2.5 w-2.5 text-primary" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{u.displayName}</span>
                    {u.isAdmin && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/20 text-primary shrink-0">
                        admin
                      </Badge>
                    )}
                    {u.isPremium && !u.isAdmin && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-reward/30 text-reward shrink-0">
                        premium
                      </Badge>
                    )}
                    {u.id === currentUserId && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-neon/20 text-neon shrink-0">
                        vous
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50 font-mono mt-0.5">
                    <span>Steam {u.steamId}</span>
                    <span className="text-white/10">|</span>
                    <span>
                      {new Date(u.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {u.isAdmin ? (
                    <span
                      className="text-[10px] font-mono text-muted-foreground/40 hidden md:inline"
                      title="Les admins ont automatiquement accès au premium"
                    >
                      premium via admin
                    </span>
                  ) : u.adminGrantedPremium ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-reward hover:text-reward border-reward/30 hover:border-reward/50"
                      onClick={() => onTogglePremium(u)}
                      title="Retirer l'accès premium offert"
                    >
                      <Crown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Retirer premium</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => onTogglePremium(u)}
                      title="Offrir l'accès premium à cet utilisateur"
                    >
                      <Crown className="h-3.5 w-3.5 text-reward" />
                      <span className="hidden sm:inline">Offrir premium</span>
                    </Button>
                  )}

                  {u.isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40"
                      onClick={() => onToggleAdmin(u)}
                      disabled={u.id === currentUserId}
                      title={u.id === currentUserId ? 'Vous ne pouvez pas révoquer votre propre accès' : undefined}
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Révoquer</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => onToggleAdmin(u)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Promouvoir</span>
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {users.length === 0 && searchQuery && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Aucun utilisateur trouvé pour "{searchQuery}"
            </div>
          )}
          {users.length === 0 && !searchQuery && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Aucun utilisateur
            </div>
          )}
        </motion.div>
      )}

      {/* Pagination */}
      {!loading && totalUsers > pageSize && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] font-mono text-muted-foreground/50">
            Page {Math.floor(offset / pageSize) + 1} / {Math.max(1, Math.ceil(totalUsers / pageSize))}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              disabled={!canPrev}
              className="gap-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Précédent</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={!canNext}
              className="gap-1.5"
            >
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
