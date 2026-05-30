import { useEffect, useState, useCallback, useMemo, useReducer, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import type { CommonGame } from '@wawptn/types'
import { useGroupStore } from '@/stores/group.store'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { PageHeader } from '@/components/app-layout'
import { GroupPanel } from '@/components/group-panel'
import { GroupTabs, type GroupTab } from '@/components/group-tabs'
import { GameGrid, type GameFilters } from '@/components/game-grid'
import { RandomPickModal } from '@/components/random-pick-modal'
import { VoteSetupDialog } from '@/components/vote-setup-dialog'
import { TonightPickHero } from '@/components/tonight-pick-hero'
import { PersonaBadge } from '@/components/persona-badge'
import { DiscordSetupInstructions } from '@/components/discord-setup-instructions'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useGroupActions } from './useGroupActions'
import { useGroupRealtime } from './useGroupRealtime'
import type { ActiveVoteSession, TodayPersona, VoteHistoryEntry } from './groupDataReducer'

function isGroupTab(value: string | null): value is GroupTab {
  return value === 'tonight' || value === 'members' || value === 'history' || value === 'stats' || value === 'settings'
}

// The three modal flags are independent booleans (each can be toggled on its
// own) but they form one cohesive "which overlays are open" concern, so a tiny
// reducer keeps them together without changing the open/close semantics.
interface DialogsState {
  voteSetup: boolean
  randomPick: boolean
  discord: boolean
}

const initialDialogs: DialogsState = { voteSetup: false, randomPick: false, discord: false }

type DialogsAction = { dialog: keyof DialogsState; open: boolean }

function dialogsReducer(state: DialogsState, action: DialogsAction): DialogsState {
  if (state[action.dialog] === action.open) return state
  return { ...state, [action.dialog]: action.open }
}

export function GroupPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentGroup } = useGroupStore()
  useDocumentTitle(currentGroup?.name ?? t('groups.title'))
  const { user } = useAuthStore()
  const [gameFilters, setGameFilters] = useState<GameFilters>({
    multiplayerOnly: true,
    coopOnly: false,
    selectedGenres: [],
    minMetacritic: null,
    gamesOnly: true,
    controllerOnly: false,
    sortBy: 'popularity',
  })
  const [dialogs, dispatchDialog] = useReducer(dialogsReducer, initialDialogs)
  const { voteSetup: voteSetupOpen, randomPick: randomPickOpen, discord: discordDialogOpen } = dialogs
  const setVoteSetupOpen = useCallback((open: boolean) => dispatchDialog({ dialog: 'voteSetup', open }), [])
  const setRandomPickOpen = useCallback((open: boolean) => dispatchDialog({ dialog: 'randomPick', open }), [])
  const setDiscordDialogOpen = useCallback((open: boolean) => dispatchDialog({ dialog: 'discord', open }), [])
  const activeFilter = gameFilters.multiplayerOnly ? 'multiplayer' : gameFilters.coopOnly ? 'coop' : undefined

  // Server-driven data (games, vote history, active session, persona,
  // presence) plus its loading + live socket subscription. Mirrors the
  // backend's "one open session per group" guard so the page can surface a
  // "join existing vote" CTA instead of walking users through the setup dialog
  // only to bounce off a 409 on the vote page.
  const { data, dispatch, loadActiveVoteSession, lastSeenMap } = useGroupRealtime({
    id,
    activeFilter,
    currentUserId: user?.id,
    onVoteSetupOpenChange: setVoteSetupOpen,
  })
  const { games: commonGames, voteHistory, voteHistoryTruncated, activeVoteSession, todayPersona, onlineUserIds } = data
  const loadingGames = data.gamesLoading

  const {
    syncing,
    inviteToken,
    handleSync,
    handleStartVote,
    openVoteFlow,
    handleGenerateInvite,
    handleLeaveGroup,
    handleKickMember,
    handleDeleteGroup,
    handleRenameGroup,
    handleDeleteHistory,
    handleToggleNotifications,
    handleUpdateAutoVote,
    handleUpdateReleasesDigest,
    handleTestReleasesDigest,
  } = useGroupActions({
    id,
    activeFilter,
    activeVoteSession,
    onActiveVoteSession: (session) => dispatch({ type: 'activeVoteSession', session }),
    onRemoveHistoryEntry: (sessionId) => dispatch({ type: 'removeHistoryEntry', sessionId }),
    reloadActiveVoteSession: loadActiveVoteSession,
    openVoteSetup: () => setVoteSetupOpen(true),
  })

  // Keep the hero persona in sync with the group detail response. The
  // socket listener above applies live midnight/override flips on top.
  useEffect(() => {
    if (currentGroup?.todayPersona) {
      dispatch({ type: 'todayPersona', persona: currentGroup.todayPersona })
    }
  }, [currentGroup?.todayPersona, dispatch])

  // Action-first launch from GroupsPage: ?startVote=1 means the user clicked
  // the hero CTA on the dashboard. The dialog needs the member list, so we
  // can't act until the group detail has loaded. We strip the param as soon
  // as it's seen (so a refresh / back never re-triggers the flow) and carry
  // the intent in a ref. A second effect, gated on the loaded group, then
  // opens the right surface — joining an existing vote or the participant
  // picker. Splitting "consume the param" from "open the surface" keeps each
  // effect to a single state write instead of chaining them.
  const pendingStartVoteRef = useRef(false)
  useEffect(() => {
    if (searchParams.get('startVote') !== '1') return
    pendingStartVoteRef.current = true
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('startVote')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!pendingStartVoteRef.current) return
    if (!currentGroup) return
    pendingStartVoteRef.current = false
    if (activeVoteSession) {
      navigate(`/groups/${currentGroup.id}/vote`, { replace: true })
    } else {
      setVoteSetupOpen(true)
    }
  }, [currentGroup, activeVoteSession, navigate, setVoteSetupOpen])

  const onlineMembers = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const currentUserRole = currentGroup?.members.find(m => m.id === user?.id)?.role || 'member'

  // Active group-detail tab, mirrored in the URL (`?tab=`) so a section is
  // deep-linkable and the browser back button leaves the group rather than
  // cycling tabs. Defaults to "tonight" — the play-a-game-now surface.
  const tabParam = searchParams.get('tab')
  const activeTab: GroupTab = isGroupTab(tabParam) ? tabParam : 'tonight'
  const setActiveTab = useCallback((next: GroupTab) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next === 'tonight') params.delete('tab')
      else params.set('tab', next)
      return params
    }, { replace: true })
  }, [setSearchParams])

  if (!currentGroup) {
    return (
      <>
        <PageHeader>
          <Skeleton className="size-5 rounded" />
        </PageHeader>
        <main id="main-content" className="max-w-5xl mx-auto p-4 w-full">
          <output
            aria-busy="true"
            aria-live="polite"
            aria-label={t('common.loading', 'Chargement…')}
            className="block space-y-4"
          >
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-[400px] w-full rounded-lg" />
          </output>
        </main>
      </>
    )
  }

  // Shared props for the four secondary tab panels (members / history /
  // stats / settings). Built once so the giant prop list isn't repeated.
  const panelProps = {
    members: currentGroup.members,
    groupId: id!,
    groupName: currentGroup.name,
    syncing,
    inviteToken,
    voteHistory,
    voteHistoryTruncated,
    onlineMembers,
    lastSeenMap,
    currentUserId: user?.id || '',
    currentUserRole,
    autoVoteSchedule: currentGroup.autoVoteSchedule,
    autoVoteDurationMinutes: currentGroup.autoVoteDurationMinutes,
    releasesDigestEnabled: currentGroup.releasesDigestEnabled,
    releasesDigestSchedule: currentGroup.releasesDigestSchedule,
    releasesDigestCoopOnly: currentGroup.releasesDigestCoopOnly,
    discordChannelId: currentGroup.discordChannelId,
    onSync: handleSync,
    onGenerateInvite: handleGenerateInvite,
    onLeaveGroup: handleLeaveGroup,
    onKickMember: handleKickMember,
    onDeleteGroup: handleDeleteGroup,
    onRenameGroup: handleRenameGroup,
    onDeleteHistory: handleDeleteHistory,
    onToggleNotifications: handleToggleNotifications,
    onUpdateAutoVote: handleUpdateAutoVote,
    onUpdateReleasesDigest: handleUpdateReleasesDigest,
    onTestReleasesDigest: handleTestReleasesDigest,
  }

  return (
    <>
      <GroupPageHeader
        groupName={currentGroup.name}
        onlineCount={onlineUserIds.length}
        onBack={() => navigate('/')}
      />

      <main id="main-content" className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 min-w-0">
        <GroupTabs active={activeTab} onChange={setActiveTab} voteLive={!!activeVoteSession} />

        <div className="pt-4">
          {activeTab !== 'tonight' && (
            <div className="max-w-2xl mx-auto">
              <GroupPanel section={activeTab} {...panelProps} />
            </div>
          )}

          {activeTab === 'tonight' && (
            <TonightTab
              group={currentGroup}
              currentUserRole={currentUserRole}
              commonGames={commonGames}
              loadingGames={loadingGames}
              voteHistory={voteHistory}
              gameFilters={gameFilters}
              setGameFilters={setGameFilters}
              syncing={syncing}
              activeVoteSession={activeVoteSession}
              todayPersona={todayPersona}
              groupId={id}
              onStartVote={openVoteFlow}
              onRandomPick={() => setRandomPickOpen(true)}
              onJoinActiveVote={() => navigate(`/groups/${id}/vote`)}
              onSync={handleSync}
              onOpenDiscord={() => setDiscordDialogOpen(true)}
            />
          )}
        </div>

        {/* Spacer so the mobile fixed action bar never covers content. */}
        <div className="h-20 sm:hidden" />
      </main>

      <GroupMobileActionBar
        activeVoteSession={activeVoteSession}
        commonGamesCount={commonGames.length}
        onVote={openVoteFlow}
      />

      <GroupDialogs
        members={currentGroup.members}
        groupId={id!}
        commonGames={commonGames}
        onlineMembers={onlineMembers}
        activeFilter={activeFilter}
        onStartVote={handleStartVote}
        randomPickOpen={randomPickOpen}
        onRandomPickOpenChange={setRandomPickOpen}
        voteSetupOpen={voteSetupOpen}
        onVoteSetupOpenChange={setVoteSetupOpen}
        discordDialogOpen={discordDialogOpen}
        onDiscordDialogOpenChange={setDiscordDialogOpen}
      />
    </>
  )
}

type GroupDetail = NonNullable<ReturnType<typeof useGroupStore.getState>['currentGroup']>
type GroupMember = GroupDetail['members'][number]

interface GroupPageHeaderProps {
  groupName: string
  onlineCount: number
  onBack: () => void
}

function GroupPageHeader({ groupName, onlineCount, onBack }: GroupPageHeaderProps) {
  const { t } = useTranslation()
  return (
    <PageHeader>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('group.back')} className="shrink-0">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-base sm:text-lg font-heading font-bold truncate min-w-0 flex-1">{groupName}</h1>
        {onlineCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal shrink-0 hidden sm:inline-flex">
            <span className="size-1.5 rounded-full bg-online animate-pulse" />
            {t('group.onlineCount', { count: onlineCount })}
          </Badge>
        )}
      </div>
    </PageHeader>
  )
}

interface GroupMobileActionBarProps {
  activeVoteSession: ActiveVoteSession | null
  commonGamesCount: number
  onVote: () => void
}

// Mobile: persistent bottom action bar — keeps the vote CTA one tap away from
// every tab on small screens. Flips to "join vote" when a session is already
// open so the user isn't walked through the setup dialog for nothing.
function GroupMobileActionBar({ activeVoteSession, commonGamesCount, onVote }: GroupMobileActionBarProps) {
  const { t } = useTranslation()
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/95 backdrop-blur-sm border-t border-border px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Button
        onClick={onVote}
        className="w-full h-12 gap-2 active:scale-[0.98] transition-transform"
      >
        {activeVoteSession ? (
          <span className="font-heading font-bold">{t('group.joinActiveVote')}</span>
        ) : (
          <>
            <span className="font-heading font-bold">{t('group.startVote')}</span>
            <span className="opacity-80 text-sm">· {t('group.commonGamesCount', { count: commonGamesCount })}</span>
          </>
        )}
      </Button>
    </div>
  )
}

interface GroupDialogsProps {
  members: GroupMember[]
  groupId: string
  commonGames: CommonGame[]
  onlineMembers: Set<string>
  activeFilter: string | undefined
  onStartVote: (participantIds: string[], scheduledAt?: string, filters?: { multiplayer: boolean; coop: boolean; free: boolean }) => void
  randomPickOpen: boolean
  onRandomPickOpenChange: (open: boolean) => void
  voteSetupOpen: boolean
  onVoteSetupOpenChange: (open: boolean) => void
  discordDialogOpen: boolean
  onDiscordDialogOpenChange: (open: boolean) => void
}

// Dialogs — mounted regardless of the active tab so the vote / random pick /
// Discord flows can be triggered from anywhere (incl. the `?startVote=1` deep
// link from the dashboard).
function GroupDialogs({
  members,
  groupId,
  commonGames,
  onlineMembers,
  activeFilter,
  onStartVote,
  randomPickOpen,
  onRandomPickOpenChange,
  voteSetupOpen,
  onVoteSetupOpenChange,
  discordDialogOpen,
  onDiscordDialogOpenChange,
}: GroupDialogsProps) {
  const { t } = useTranslation()
  return (
    <>
      <RandomPickModal
        open={randomPickOpen}
        onOpenChange={onRandomPickOpenChange}
        games={commonGames}
      />

      <VoteSetupDialog
        open={voteSetupOpen}
        onOpenChange={onVoteSetupOpenChange}
        members={members}
        groupId={groupId}
        onlineMembers={onlineMembers}
        activeFilter={activeFilter}
        onStartVote={onStartVote}
      />

      <ResponsiveDialog open={discordDialogOpen} onOpenChange={onDiscordDialogOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.discordBannerDialogTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('group.discordBannerHint')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="mt-4 space-y-4">
            <DiscordSetupInstructions />
            <div className="flex items-center justify-end">
              <Button variant="secondary" onClick={() => onDiscordDialogOpenChange(false)}>
                {t('common.close', 'Fermer')}
              </Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}

interface TonightTabProps {
  group: GroupDetail
  currentUserRole: string
  commonGames: CommonGame[]
  loadingGames: boolean
  voteHistory: VoteHistoryEntry[]
  gameFilters: GameFilters
  setGameFilters: React.Dispatch<React.SetStateAction<GameFilters>>
  syncing: boolean
  activeVoteSession: ActiveVoteSession | null
  todayPersona: TodayPersona | null
  groupId: string | undefined
  onStartVote: () => void
  onRandomPick: () => void
  onJoinActiveVote: () => void
  onSync: () => void
  onOpenDiscord: () => void
}

// "Tonight" tab — the play-a-game-now surface: Discord linkage banner/chip,
// the persona-du-jour badge, the recommendation hero, and the filterable
// common-games grid. Extracted from GroupPage to keep that component focused
// on data orchestration.
function TonightTab({
  group,
  currentUserRole,
  commonGames,
  loadingGames,
  voteHistory,
  gameFilters,
  setGameFilters,
  syncing,
  activeVoteSession,
  todayPersona,
  groupId,
  onStartVote,
  onRandomPick,
  onJoinActiveVote,
  onSync,
  onOpenDiscord,
}: TonightTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4 min-w-0">
      {/* Owner-only prompt: if the group has no Discord channel
          bound yet, surface a persistent banner inviting the owner
          to link one. The banner stays visible until a channel is
          bound (no dismiss — Discord binding is core, not optional
          post-creation). Hidden for non-owners and for already-
          bound groups. */}
      {currentUserRole === 'owner' && !group.discordChannelId && (
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4 flex items-start gap-3">
            <Link2 className="size-5 mt-0.5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('group.discordBannerTitle')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('group.discordBannerHint')}</p>
            </div>
            <Button size="sm" onClick={onOpenDiscord} className="shrink-0">
              {t('group.discordBannerCta')}
            </Button>
          </div>
        </m.div>
      )}

      {/* Persistent "linked to X" chip — visible to all members once
          a Discord channel is bound, so everyone knows where vote
          announcements will land. Falls back to a generic label for
          groups bound before the name-snapshot migration. */}
      {group.discordChannelId && (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border/60 bg-muted/20 rounded-full px-2.5 py-1">
          <Link2 className="size-3 text-primary shrink-0" />
          {group.discordChannelName || group.discordGuildName ? (
            <span className="truncate">
              {group.discordChannelName && (
                <span className="font-medium">#{group.discordChannelName}</span>
              )}
              {group.discordChannelName && group.discordGuildName && (
                <span className="text-muted-foreground/60"> · </span>
              )}
              {group.discordGuildName && <span>{group.discordGuildName}</span>}
            </span>
          ) : (
            <span>{t('group.discordLinkedFallback')}</span>
          )}
        </div>
      )}

      {/* Per-group "persona du jour" — hero variant. Pre-fetched via
          the enriched group detail response, refreshed live via the
          `persona:changed` socket event (midnight flip or owner
          override). */}
      {todayPersona && (
        <PersonaBadge
          groupId={groupId}
          persona={todayPersona}
          variant="hero"
        />
      )}

      {/* Hero: "Tonight's Pick" — dominant CTA at the top of the page.
          Replaces the old 2-button grid (Start vote / Random pick) and
          surfaces a client-scored recommendation so a first-time user
          can start a vote in one tap without touching any filter. */}
      <TonightPickHero
        games={commonGames}
        loading={loadingGames}
        voteHistory={voteHistory}
        members={group.members}
        onStartVote={onStartVote}
        onRandomPick={onRandomPick}
        activeVoteSession={activeVoteSession}
        onJoinActiveVote={onJoinActiveVote}
      />

      <GameGrid
        games={commonGames}
        loading={loadingGames}
        filters={gameFilters}
        onSyncLibraries={onSync}
        syncing={syncing}
        onToggleMultiplayer={(value) => setGameFilters(prev => ({
          ...prev,
          multiplayerOnly: value,
          coopOnly: value ? false : prev.coopOnly,
        }))}
        onToggleCoop={(value) => setGameFilters(prev => ({
          ...prev,
          coopOnly: value,
          multiplayerOnly: value ? false : prev.multiplayerOnly,
        }))}
        onToggleGenre={(genreId) => setGameFilters(prev => ({
          ...prev,
          selectedGenres: prev.selectedGenres.includes(genreId)
            ? prev.selectedGenres.filter(id => id !== genreId)
            : [...prev.selectedGenres, genreId],
        }))}
        onSetMinMetacritic={(value) => setGameFilters(prev => ({
          ...prev,
          minMetacritic: value,
        }))}
        onToggleGamesOnly={(value) => setGameFilters(prev => ({
          ...prev,
          gamesOnly: value,
        }))}
        onToggleControllerOnly={(value) => setGameFilters(prev => ({
          ...prev,
          controllerOnly: value,
        }))}
        onSetSortBy={(value) => setGameFilters(prev => ({
          ...prev,
          sortBy: value,
        }))}
        onResetFilters={() => setGameFilters({
          multiplayerOnly: true,
          coopOnly: false,
          selectedGenres: [],
          minMetacritic: null,
          gamesOnly: true,
          controllerOnly: false,
          sortBy: 'popularity',
        })}
        onApplyPreset={(patch) => setGameFilters(prev => ({ ...prev, ...patch }))}
      />
    </div>
  )
}
