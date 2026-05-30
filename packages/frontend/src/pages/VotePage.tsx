import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Vote, CircleOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ResultScreen } from './vote/result-screen'
import { WaitingScreen } from './vote/waiting-screen'
import { GameSelection } from './vote/game-selection'
import { useVoteSession } from './vote/use-vote-session'

export function VotePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('vote.title'))
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goBack = () => navigate(`/groups/${id}`)

  const {
    state,
    pending,
    search,
    detailGame,
    setSearch,
    setDetailGame,
    filteredGames,
    canClose,
    toggleGame,
    submitVotes,
    handleClose,
    handleRematch,
    handleSteamLaunch,
  } = useVoteSession(id)

  const {
    session,
    games,
    selectedGames,
    voterCount,
    totalMembers,
    result,
    hasVoted,
    isParticipant,
    noSession,
    participantIds,
    votedUserIds,
  } = state

  // No active session
  if (noSession) {
    return (
      <div className="min-h-dvh flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={goBack} aria-label={t('group.back')}>
            <ArrowLeft className="size-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={CircleOff}
            title={t('vote.noActiveSessionTitle')}
            description={t('vote.noActiveSessionDescription')}
            action={{
              label: t('vote.backToGroup'),
              onClick: goBack,
            }}
          />
        </main>
        <AppFooter />
      </div>
    )
  }

  // Result screen — owns its reveal choreography, focus management and
  // reduced-motion hooks. The hook keeps the lifecycle effects
  // (completedSessionRef, launch-timeout toast) since they read `session`.
  if (result) {
    return (
      <ResultScreen
        result={result}
        sessionId={session?.id ?? null}
        rematching={pending === 'rematch'}
        onRematch={handleRematch}
        onBack={goBack}
        onSteamLaunch={handleSteamLaunch}
      />
    )
  }

  // Waiting screen (already voted)
  if (hasVoted) {
    return (
      <WaitingScreen
        session={session}
        selectedCount={selectedGames.size}
        voterCount={voterCount}
        totalMembers={totalMembers}
        participantIds={participantIds}
        votedUserIds={votedUserIds}
        canClose={canClose}
        closing={pending === 'close'}
        onClose={handleClose}
        onBack={goBack}
      />
    )
  }

  // Non-participant view
  if (!isParticipant) {
    return (
      <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center p-4">
        <Vote className="size-16 text-muted-foreground mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-heading font-bold mb-2">{t('vote.sessionInProgress')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('vote.notParticipant')}
        </p>
        <Button variant="ghost" onClick={goBack}>
          {t('vote.backToGroup')}
        </Button>
      </main>
    )
  }

  // Game selection interface
  return (
    <GameSelection
      games={games}
      filteredGames={filteredGames}
      selectedGames={selectedGames}
      search={search}
      detailGame={detailGame}
      submitting={pending === 'submit'}
      onSearchChange={setSearch}
      onToggleGame={toggleGame}
      onShowDetails={setDetailGame}
      onSubmit={submitVotes}
      onBack={goBack}
    />
  )
}
