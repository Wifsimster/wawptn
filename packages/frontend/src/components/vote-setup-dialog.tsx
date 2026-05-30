import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Vote, Loader2, Users, Calendar, Handshake, CircleDollarSign, Lock, AlertTriangle } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription.store'
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

// All editable form state for the dialog lives in one reducer so that opening
// the dialog (and other grouped transitions) is a single atomic update rather
// than a cascade of individual setState calls. The live game-count preview
// (loading flag + result) lives here too so the debounced effect updates it
// with a single dispatch instead of several setState calls.
interface FormState {
  step: Step
  selectedIds: Set<string>
  previewCount: number | null
  isScheduled: boolean
  scheduledDate: string
  gameFilters: VoteGameFilters
  loadingLivePreview: boolean
  livePreviewCount: number | null
}

type FormAction =
  | { type: 'reset'; selectedIds: Set<string>; scheduledDate: string }
  | { type: 'toggleMember'; id: string }
  | { type: 'setSelectedIds'; selectedIds: Set<string> }
  | { type: 'goToConfirm'; previewCount: number | null }
  | { type: 'goToSelect' }
  | { type: 'toggleFilter'; key: keyof VoteGameFilters }
  | { type: 'setScheduled'; value: boolean }
  | { type: 'setScheduledDate'; value: string }
  | { type: 'livePreviewPending' }
  | { type: 'livePreviewIdle' }
  | { type: 'livePreviewResult'; count: number | null }

function createInitialFormState(selectedIds: Set<string>, scheduledDate: string): FormState {
  return {
    step: 'select',
    selectedIds,
    previewCount: null,
    isScheduled: false,
    scheduledDate,
    gameFilters: { multiplayer: false, coop: false, free: false },
    loadingLivePreview: false,
    livePreviewCount: null,
  }
}

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'reset':
      return createInitialFormState(action.selectedIds, action.scheduledDate)
    case 'toggleMember': {
      const next = new Set(state.selectedIds)
      if (next.has(action.id)) next.delete(action.id)
      else next.add(action.id)
      return { ...state, selectedIds: next }
    }
    case 'setSelectedIds':
      return { ...state, selectedIds: action.selectedIds }
    case 'goToConfirm':
      return { ...state, step: 'confirm', previewCount: action.previewCount }
    case 'goToSelect':
      return { ...state, step: 'select', previewCount: null }
    case 'toggleFilter':
      return { ...state, gameFilters: { ...state.gameFilters, [action.key]: !state.gameFilters[action.key] } }
    case 'setScheduled':
      return { ...state, isScheduled: action.value }
    case 'setScheduledDate':
      return { ...state, scheduledDate: action.value }
    case 'livePreviewPending':
      return { ...state, loadingLivePreview: true }
    case 'livePreviewIdle':
      return { ...state, loadingLivePreview: false, livePreviewCount: null }
    case 'livePreviewResult':
      return { ...state, loadingLivePreview: false, livePreviewCount: action.count }
    default:
      return state
  }
}

export function VoteSetupDialog({ open, onOpenChange, members, groupId, onlineMembers, activeFilter, onStartVote }: VoteSetupDialogProps) {
  const { t } = useTranslation()
  const { tier, status } = useSubscriptionStore()
  const isPremium = tier === 'premium' && status === 'active'

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

  const [form, dispatch] = useReducer(
    formReducer,
    undefined,
    () => createInitialFormState(new Set(members.map(m => m.id)), defaultScheduledDate),
  )
  const { step, selectedIds, previewCount, isScheduled, scheduledDate, gameFilters, loadingLivePreview, livePreviewCount } = form

  const [loadingPreview, setLoadingPreview] = useState(false)

  // Re-seed the editable form when the dialog transitions from closed to open.
  // The previous open-state is tracked in a ref (not state) and compared during
  // render so the reset is a single dispatch with no extra stale commit — see
  // react.dev "You Might Not Need an Effect". Opening is driven by the parent
  // `open` prop, so it cannot be handled in an event handler here.
  const wasOpenRef = useRef(open)
  if (open !== wasOpenRef.current) {
    wasOpenRef.current = open
    if (open) {
      dispatch({ type: 'reset', selectedIds: new Set(members.map(m => m.id)), scheduledDate: defaultScheduledDate })
    }
  }

  // Debounced live preview of common game count. The fetch is an async side
  // effect (network), so it stays in an effect; all state updates flow through a
  // single dispatch per outcome rather than several setState calls.
  useEffect(() => {
    if (!open || step !== 'select') return

    const memberIdArray = Array.from(selectedIds)
    if (memberIdArray.length < 2) {
      dispatch({ type: 'livePreviewIdle' })
      return
    }

    dispatch({ type: 'livePreviewPending' })

    // Controller for the request this effect run may start. Tracked in a local
    // (not a ref) so the cleanup closure aborts exactly this run's request.
    let controller: AbortController | null = null

    const timer = setTimeout(() => {
      controller = new AbortController()
      const signal = controller.signal

      api.previewCommonGames(groupId, memberIdArray, activeFilter)
        .then((result) => {
          if (!signal.aborted) {
            dispatch({ type: 'livePreviewResult', count: result.gameCount })
          }
        })
        .catch(() => {
          if (!signal.aborted) {
            dispatch({ type: 'livePreviewResult', count: null })
          }
        })
    }, 300)

    return () => {
      clearTimeout(timer)
      controller?.abort()
    }
  }, [open, step, selectedIds, groupId, activeFilter])

  const sortedMembers = members.toSorted((a, b) => {
    const aOnline = onlineMembers.has(a.id)
    const bOnline = onlineMembers.has(b.id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  const selectedMembers = useMemo(
    () => members.reduce<Member[]>((acc, m) => {
      if (selectedIds.has(m.id)) acc.push(m)
      return acc
    }, []),
    [members, selectedIds],
  )

  const allSelected = selectedIds.size === members.length
  const canProceed = selectedIds.size >= 2
  const hasActiveGameFilters = gameFilters.multiplayer || gameFilters.coop || gameFilters.free

  const toggleMember = (id: string) => {
    dispatch({ type: 'toggleMember', id })
  }

  const toggleAll = () => {
    dispatch({ type: 'setSelectedIds', selectedIds: allSelected ? new Set() : new Set(members.map(m => m.id)) })
  }

  const handleNext = async () => {
    setLoadingPreview(true)
    try {
      const filtersParam = hasActiveGameFilters ? gameFilters : undefined
      const result = await api.previewCommonGames(groupId, Array.from(selectedIds), activeFilter, filtersParam)
      dispatch({ type: 'goToConfirm', previewCount: result.gameCount })
    } catch {
      // If preview fails, still allow proceeding without count
      dispatch({ type: 'goToConfirm', previewCount: null })
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleBack = () => {
    dispatch({ type: 'goToSelect' })
  }

  // One-tap path: start the vote straight from the member-selection step
  // with no game filters and no scheduling. The live common-game count is
  // already shown above, so the confirm step adds nothing for this case.
  const handleQuickStart = () => {
    onStartVote(Array.from(selectedIds), undefined, undefined)
    onOpenChange(false)
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
          <SelectStep
            sortedMembers={sortedMembers}
            onlineMembers={onlineMembers}
            selectedIds={selectedIds}
            allSelected={allSelected}
            canProceed={canProceed}
            loadingPreview={loadingPreview}
            loadingLivePreview={loadingLivePreview}
            livePreviewCount={livePreviewCount}
            onToggleAll={toggleAll}
            onToggleMember={toggleMember}
            onNext={handleNext}
            onQuickStart={handleQuickStart}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            selectedMembers={selectedMembers}
            selectedCount={selectedIds.size}
            previewCount={previewCount}
            gameFilters={gameFilters}
            isScheduled={isScheduled}
            isPremium={isPremium}
            scheduledDate={scheduledDate}
            minDateTime={minDateTime}
            onToggleFilter={(key) => dispatch({ type: 'toggleFilter', key })}
            onToggleScheduled={(value) => dispatch({ type: 'setScheduled', value })}
            onScheduledDateChange={(value) => dispatch({ type: 'setScheduledDate', value })}
            onBack={handleBack}
            onConfirm={handleConfirm}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface SelectStepProps {
  sortedMembers: Member[]
  onlineMembers: Set<string>
  selectedIds: Set<string>
  allSelected: boolean
  canProceed: boolean
  loadingPreview: boolean
  loadingLivePreview: boolean
  livePreviewCount: number | null
  onToggleAll: () => void
  onToggleMember: (id: string) => void
  onNext: () => void
  onQuickStart: () => void
}

function SelectStep({
  sortedMembers,
  onlineMembers,
  selectedIds,
  allSelected,
  canProceed,
  loadingPreview,
  loadingLivePreview,
  livePreviewCount,
  onToggleAll,
  onToggleMember,
  onNext,
  onQuickStart,
}: SelectStepProps) {
  const { t } = useTranslation()
  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2">
          <Users className="size-5 text-primary" />
          {t('voteSetup.title')}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {t('voteSetup.description')}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="space-y-3">
        <label
          htmlFor="select-all"
          className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-md cursor-pointer hover:bg-accent/50 active:bg-accent/10 transition-colors"
        >
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={onToggleAll}
            className="size-6 sm:size-5 shrink-0"
          />
          <span className="text-sm font-medium text-muted-foreground">{t('voteSetup.selectAll')}</span>
        </label>

        <div className="border-t border-border" />

        {/* Desktop keeps a bounded inner scroll so the dialog footer
            stays visible while a long member list is scrolled. On
            mobile the component renders as a Drawer which already
            provides an outer scroll (`ResponsiveDialogContent` line
            88), so a nested scroll here turned into a swipe trap
            when users tried to reach the footer. Let the drawer
            handle overflow on small screens. */}
        <div className="sm:max-h-[40dvh] sm:overflow-y-auto sm:overflow-x-hidden sm:overscroll-contain">
          {sortedMembers.map((member) => {
            const isOnline = onlineMembers.has(member.id)
            return (
              <label key={member.id} htmlFor={`member-${member.id}`} className="flex items-center gap-3 py-2.5 px-2 rounded-md cursor-pointer hover:bg-accent/50 active:bg-accent/10 transition-colors min-w-0">
                <Checkbox
                  id={`member-${member.id}`}
                  checked={selectedIds.has(member.id)}
                  onCheckedChange={() => onToggleMember(member.id)}
                  className="size-6 sm:size-5 shrink-0"
                />
                <div className="relative shrink-0">
                  <Avatar className="size-7">
                    <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                    <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute bottom-0 right-0 size-2 rounded-full border-2 border-card ${isOnline ? 'bg-online' : 'bg-muted-foreground/40'}`}
                  />
                </div>
                <span className={`text-sm font-medium truncate ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Live game count preview */}
      <div className="mt-3 flex items-center gap-2 text-sm">
        {selectedIds.size < 2 ? (
          <span className="text-muted-foreground">
            {t('voteSetup.selectAtLeastTwoMembers')}
          </span>
        ) : loadingLivePreview ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('voteSetup.calculatingCommonGames')}
          </span>
        ) : livePreviewCount !== null && livePreviewCount === 0 ? (
          <span className="flex items-center gap-2 text-warning">
            <AlertTriangle className="size-4" />
            {t('voteSetup.noCommonGames')}
          </span>
        ) : livePreviewCount !== null ? (
          <span className="text-muted-foreground">
            🎮 {t('voteSetup.commonGamesCount', { count: livePreviewCount })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-4">
        <span className="text-xs text-muted-foreground">
          {t('voteSetup.selectedCount', { count: selectedIds.size })}
        </span>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="ghost"
            onClick={onNext}
            disabled={!canProceed || loadingPreview}
            className="flex-1 sm:flex-initial"
          >
            {loadingPreview && <Loader2 className="size-4 mr-2 animate-spin" />}
            {t('voteSetup.moreOptions')}
          </Button>
          <Button
            onClick={onQuickStart}
            disabled={!canProceed || loadingPreview}
            className="flex-1 sm:flex-initial"
          >
            <Vote className="size-4 mr-2" />
            {t('voteSetup.startVote')}
          </Button>
        </div>
      </div>
    </>
  )
}

interface ConfirmStepProps {
  selectedMembers: Member[]
  selectedCount: number
  previewCount: number | null
  gameFilters: VoteGameFilters
  isScheduled: boolean
  isPremium: boolean
  scheduledDate: string
  minDateTime: string
  onToggleFilter: (key: keyof VoteGameFilters) => void
  onToggleScheduled: (value: boolean) => void
  onScheduledDateChange: (value: string) => void
  onBack: () => void
  onConfirm: () => void
}

function ConfirmStep({
  selectedMembers,
  selectedCount,
  previewCount,
  gameFilters,
  isScheduled,
  isPremium,
  scheduledDate,
  minDateTime,
  onToggleFilter,
  onToggleScheduled,
  onScheduledDateChange,
  onBack,
  onConfirm,
}: ConfirmStepProps) {
  const { t } = useTranslation()
  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2">
          <Vote className="size-5 text-primary" />
          {t('voteSetup.confirmTitle')}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {previewCount !== null
            ? t('voteSetup.confirmDescription', { players: selectedCount, games: previewCount })
            : t('voteSetup.confirmDescriptionNoPreview', { players: selectedCount })
          }
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="flex items-center gap-2 flex-wrap py-2 px-3 sm:px-4">
        {selectedMembers.map((member) => (
          <Avatar key={member.id} className="size-8">
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
            onClick={() => onToggleFilter('multiplayer')}
            className="gap-1.5"
          >
            <Users className="size-3.5" />
            {t('voteSetup.filterMultiplayer')}
          </Button>
          <Button
            type="button"
            variant={gameFilters.coop ? 'default' : 'secondary'}
            size="sm"
            onClick={() => onToggleFilter('coop')}
            className="gap-1.5"
          >
            <Handshake className="size-3.5" />
            {t('voteSetup.filterCoop')}
          </Button>
          <Button
            type="button"
            variant={gameFilters.free ? 'default' : 'secondary'}
            size="sm"
            onClick={() => onToggleFilter('free')}
            className="gap-1.5"
          >
            <CircleDollarSign className="size-3.5" />
            {t('voteSetup.filterFree')}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <label htmlFor="schedule-toggle" className={`flex items-center gap-3 py-1 ${isPremium ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
          <Checkbox
            id="schedule-toggle"
            checked={isScheduled}
            onCheckedChange={(checked) => isPremium && onToggleScheduled(checked === true)}
            disabled={!isPremium}
            className="size-5"
          />
          <Calendar className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('voteSetup.scheduleLater')}</span>
          {!isPremium && <Lock className="size-3.5 text-muted-foreground" />}
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
              onChange={(e) => onScheduledDateChange(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-primary/30"
            />
            <p className="text-xs text-muted-foreground">
              {t('voteSetup.scheduleHint')}
            </p>
          </div>
        )}
      </div>

      <ResponsiveDialogFooter className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">
          <ArrowLeft className="size-4 mr-2" />
          {t('voteSetup.back')}
        </Button>
        <Button onClick={onConfirm} disabled={isScheduled && !scheduledDate} className="w-full sm:w-auto">
          {isScheduled ? t('voteSetup.scheduleVote') : t('voteSetup.startVote')}
        </Button>
      </ResponsiveDialogFooter>
    </>
  )
}
