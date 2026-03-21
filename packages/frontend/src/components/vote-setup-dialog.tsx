import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Vote, Loader2, Users, Calendar, Handshake, CircleDollarSign } from 'lucide-react'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { api } from '@/lib/api'

export interface VoteGameFilters {
  multiplayer: boolean
  coop: boolean
  free: boolean
}

interface Member {
  id: string
  displayName: string
  avatarUrl: string
  role: string
}

interface VoteSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  groupId: string
  onlineMembers: Set<string>
  activeFilter?: string
  onStartVote: (participantIds: string[], scheduledAt?: string, filters?: VoteGameFilters) => void
}

type Step = 'select' | 'confirm'

export function VoteSetupDialog({ open, onOpenChange, members, groupId, onlineMembers, activeFilter, onStartVote }: VoteSetupDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [gameFilters, setGameFilters] = useState<VoteGameFilters>({
    multiplayer: false,
    coop: false,
    free: false,
  })

  // Compute minimum datetime-local value (15 minutes from now)
  const minDateTime = useMemo(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000)
    return d.toISOString().slice(0, 16)
  }, [])

  // Default to today at 20:00 (or tomorrow if past 20:00)
  const defaultScheduledDate = useMemo(() => {
    const now = new Date()
    const target = new Date(now)
    target.setHours(20, 0, 0, 0)
    if (target.getTime() <= now.getTime() + 15 * 60 * 1000) {
      target.setDate(target.getDate() + 1)
    }
    return target.toISOString().slice(0, 16)
  }, [])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select')
      setSelectedIds(new Set(members.map(m => m.id)))
      setPreviewCount(null)
      setIsScheduled(false)
      setScheduledDate(defaultScheduledDate)
      setGameFilters({ multiplayer: false, coop: false, free: false })
    }
  }, [open, members, defaultScheduledDate])

  const sortedMembers = [...members].sort((a, b) => {
    const aOnline = onlineMembers.has(a.id)
    const bOnline = onlineMembers.has(b.id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  const allSelected = selectedIds.size === members.length
  const canProceed = selectedIds.size >= 2

  const toggleMember = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(members.map(m => m.id)))
    }
  }

  const hasActiveGameFilters = gameFilters.multiplayer || gameFilters.coop || gameFilters.free

  const handleNext = async () => {
    setLoadingPreview(true)
    try {
      const filtersParam = hasActiveGameFilters ? gameFilters : undefined
      const result = await api.previewCommonGames(groupId, Array.from(selectedIds), activeFilter, filtersParam)
      setPreviewCount(result.gameCount)
      setStep('confirm')
    } catch {
      // If preview fails, still allow proceeding without count
      setPreviewCount(null)
      setStep('confirm')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleBack = () => {
    setStep('select')
    setPreviewCount(null)
  }

  const handleConfirm = () => {
    const scheduled = isScheduled && scheduledDate ? new Date(scheduledDate).toISOString() : undefined
    const filtersParam = hasActiveGameFilters ? gameFilters : undefined
    onStartVote(Array.from(selectedIds), scheduled, filtersParam)
    onOpenChange(false)
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-md">
        {step === 'select' && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {t('voteSetup.title')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t('voteSetup.description')}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="space-y-3">
              <label htmlFor="select-all" className="flex items-center gap-3 py-2.5 cursor-pointer">
                <Checkbox
                  id="select-all"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  className="size-5"
                />
                <span className="text-sm font-medium text-muted-foreground">{t('voteSetup.selectAll')}</span>
              </label>

              <div className="border-t border-border" />

              <div className="max-h-[40dvh] overflow-y-auto overflow-x-hidden">
                {sortedMembers.map((member) => {
                  const isOnline = onlineMembers.has(member.id)
                  return (
                    <label key={member.id} htmlFor={`member-${member.id}`} className="flex items-center gap-3 py-2.5 px-2 rounded-md cursor-pointer hover:bg-accent/50 min-w-0">
                      <Checkbox
                        id={`member-${member.id}`}
                        checked={selectedIds.has(member.id)}
                        onCheckedChange={() => toggleMember(member.id)}
                        className="size-5 shrink-0"
                      />
                      <div className="relative shrink-0">
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                          <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-card ${isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                        />
                      </div>
                      <span className={`text-sm font-medium truncate ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
              <span className="text-xs text-muted-foreground">
                {t('voteSetup.selectedCount', { count: selectedIds.size })}
              </span>
              <Button onClick={handleNext} disabled={!canProceed || loadingPreview}>
                {loadingPreview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('voteSetup.next')}
              </Button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" />
                {t('voteSetup.confirmTitle')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {previewCount !== null
                  ? t('voteSetup.confirmDescription', { players: selectedIds.size, games: previewCount })
                  : t('voteSetup.confirmDescriptionNoPreview', { players: selectedIds.size })
                }
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="flex items-center gap-2 flex-wrap py-2">
              {members.filter(m => selectedIds.has(m.id)).map((member) => (
                <Avatar key={member.id} className="w-8 h-8">
                  <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                  <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
            </div>

            {previewCount !== null && (
              <p className="text-sm text-muted-foreground">
                {t('voteSetup.gameSelectionHint', { total: previewCount })}
              </p>
            )}

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground font-medium">{t('voteSetup.gameFiltersLabel')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={gameFilters.multiplayer ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setGameFilters(prev => ({ ...prev, multiplayer: !prev.multiplayer }))}
                  className="gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  {t('voteSetup.filterMultiplayer')}
                </Button>
                <Button
                  type="button"
                  variant={gameFilters.coop ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setGameFilters(prev => ({ ...prev, coop: !prev.coop }))}
                  className="gap-1.5"
                >
                  <Handshake className="w-3.5 h-3.5" />
                  {t('voteSetup.filterCoop')}
                </Button>
                <Button
                  type="button"
                  variant={gameFilters.free ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setGameFilters(prev => ({ ...prev, free: !prev.free }))}
                  className="gap-1.5"
                >
                  <CircleDollarSign className="w-3.5 h-3.5" />
                  {t('voteSetup.filterFree')}
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <label htmlFor="schedule-toggle" className="flex items-center gap-3 py-1 cursor-pointer">
                <Checkbox
                  id="schedule-toggle"
                  checked={isScheduled}
                  onCheckedChange={(checked) => setIsScheduled(checked === true)}
                  className="size-5"
                />
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('voteSetup.scheduleLater')}</span>
              </label>

              {isScheduled && (
                <div className="space-y-2 pl-4 sm:pl-8">
                  <label htmlFor="scheduled-date" className="text-xs text-muted-foreground">
                    {t('voteSetup.scheduleDateLabel')}
                  </label>
                  <input
                    id="scheduled-date"
                    type="datetime-local"
                    value={scheduledDate}
                    min={minDateTime}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('voteSetup.scheduleHint')}
                  </p>
                </div>
              )}
            </div>

            <ResponsiveDialogFooter className="mt-4 gap-2 sm:justify-between">
              <Button variant="ghost" onClick={handleBack} className="w-full sm:w-auto">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('voteSetup.back')}
              </Button>
              <Button onClick={handleConfirm} disabled={isScheduled && !scheduledDate} className="w-full sm:w-auto">
                {isScheduled ? t('voteSetup.scheduleVote') : t('voteSetup.startVote')}
              </Button>
            </ResponsiveDialogFooter>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
