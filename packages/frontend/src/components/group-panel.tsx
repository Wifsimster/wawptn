import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { GroupStats } from '@/components/group-stats'
import { GameRecommendations } from '@/components/game-recommendations'
import { useSubscriptionStore } from '@/stores/subscription.store'
import {
  MembersSection,
  HistorySection,
  SettingsActions,
  type Member,
  type VoteHistoryEntry,
} from '@/components/group-panel-sections'
import {
  LeaveGroupDialog,
  DeleteGroupDialog,
  KickMemberDialog,
  DeleteHistoryDialog,
  RenameGroupDialog,
  AutoVoteDialog,
  ReleasesDigestDialog,
} from '@/components/group-panel-dialogs'

/** Which slice of the group detail this panel renders. The "tonight"
 *  surface lives directly in GroupPage; this component owns the four
 *  secondary tabs. */
export type GroupPanelSection = 'members' | 'history' | 'stats' | 'settings'

interface GroupPanelProps {
  members: Member[]
  groupId: string
  groupName: string
  syncing: boolean
  inviteToken: string | null
  voteHistory: VoteHistoryEntry[]
  /** True when the free tier cap chopped the history — the sidebar shows an
   *  "upgrade to see full history" link instead of silently truncating. */
  voteHistoryTruncated: boolean
  onlineMembers: Set<string>
  lastSeenMap: Map<string, number>
  currentUserId: string
  currentUserRole: string
  autoVoteSchedule: string | null
  autoVoteDurationMinutes: number
  releasesDigestEnabled: boolean
  releasesDigestSchedule: string
  releasesDigestCoopOnly: boolean
  newGameSpotlightEnabled: boolean
  /** Null when the group has no linked Discord channel — the digest has
   *  nowhere to post, so the config entry point is shown disabled. */
  discordChannelId: string | null
  onSync: () => void
  onGenerateInvite: () => void
  onLeaveGroup: () => void
  onKickMember: (userId: string) => void
  onDeleteGroup: () => void
  onRenameGroup: (name: string) => Promise<void>
  onDeleteHistory: (sessionId: string) => void
  onToggleNotifications: (enabled: boolean) => void
  onUpdateAutoVote: (schedule: string | null, durationMinutes: number) => Promise<void>
  onUpdateReleasesDigest: (input: { enabled: boolean; schedule: string; coopOnly: boolean }) => Promise<void>
  /** Sends a one-off test message to the linked Discord channel so the
   *  owner can confirm the digest will land before relying on the schedule. */
  onTestReleasesDigest: () => Promise<void>
  /** Toggles the new-game spotlight (announces freshly acquired games into the
   *  group's Discord with an interactive vote). */
  onToggleNewGameSpotlight: (enabled: boolean) => void
  /** Which secondary section this panel instance renders. */
  section: GroupPanelSection
}

/** Exactly one dialog is open at a time, so the panel's modal surface is a
 *  single discriminated-union value rather than a cluster of boolean flags. */
type DialogState =
  | { type: 'none' }
  | { type: 'leave' }
  | { type: 'delete' }
  | { type: 'kick'; member: Member }
  | { type: 'deleteHistory'; entry: VoteHistoryEntry }
  | { type: 'rename' }
  | { type: 'autoVote' }
  | { type: 'digest' }

const CLOSED: DialogState = { type: 'none' }

function dialogReducer(_state: DialogState, action: DialogState): DialogState {
  return action
}

export function GroupPanel({ members, groupId, groupName, syncing, inviteToken, voteHistory, voteHistoryTruncated, onlineMembers, lastSeenMap, currentUserId, currentUserRole, autoVoteSchedule, autoVoteDurationMinutes, releasesDigestEnabled, releasesDigestSchedule, releasesDigestCoopOnly, newGameSpotlightEnabled, discordChannelId, onSync, onGenerateInvite, onLeaveGroup, onKickMember, onDeleteGroup, onRenameGroup, onDeleteHistory, onToggleNotifications, onUpdateAutoVote, onUpdateReleasesDigest, onTestReleasesDigest, onToggleNewGameSpotlight, section }: GroupPanelProps) {
  const { i18n } = useTranslation()
  const [dialog, dispatch] = useReducer(dialogReducer, CLOSED)
  const close = () => dispatch(CLOSED)
  const { tier, status } = useSubscriptionStore()
  const isPremium = tier === 'premium' && status === 'active'
  const isOwner = currentUserRole === 'owner'

  // Sort: owner first, then online, then alphabetical
  const sortedMembers = members.toSorted((a, b) => {
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
    const aOnline = onlineMembers.has(a.id)
    const bOnline = onlineMembers.has(b.id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  const currentMember = members.find(m => m.id === currentUserId)
  const notificationsEnabled = currentMember?.notificationsEnabled ?? true

  return (
    <div className="space-y-4">
      {section === 'members' && (
        <MembersSection
          members={members}
          sortedMembers={sortedMembers}
          onlineMembers={onlineMembers}
          lastSeenMap={lastSeenMap}
          currentUserId={currentUserId}
          isOwner={isOwner}
          inviteToken={inviteToken}
          onGenerateInvite={onGenerateInvite}
          onKickMember={(member) => dispatch({ type: 'kick', member })}
        />
      )}

      {section === 'history' && (
        <HistorySection
          voteHistory={voteHistory}
          voteHistoryTruncated={voteHistoryTruncated}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          isPremium={isPremium}
          language={i18n.language}
          onDeleteHistory={(entry) => dispatch({ type: 'deleteHistory', entry })}
        />
      )}

      {section === 'stats' && (
        <div className="space-y-3">
          <GameRecommendations key={groupId} groupId={groupId} />
          <GroupStats key={groupId} groupId={groupId} />
        </div>
      )}

      {section === 'settings' && (
        <SettingsActions
          isOwner={isOwner}
          isPremium={isPremium}
          syncing={syncing}
          notificationsEnabled={notificationsEnabled}
          autoVoteSchedule={autoVoteSchedule}
          releasesDigestEnabled={releasesDigestEnabled}
          newGameSpotlightEnabled={newGameSpotlightEnabled}
          discordChannelId={discordChannelId}
          onSync={onSync}
          onToggleNotifications={onToggleNotifications}
          onToggleNewGameSpotlight={onToggleNewGameSpotlight}
          onOpenRename={() => dispatch({ type: 'rename' })}
          onOpenAutoVote={() => dispatch({ type: 'autoVote' })}
          onOpenDigest={() => dispatch({ type: 'digest' })}
          onLeave={() => dispatch({ type: 'leave' })}
          onDelete={() => dispatch({ type: 'delete' })}
        />
      )}

      <LeaveGroupDialog
        open={dialog.type === 'leave'}
        onOpenChange={(open) => { if (!open) close() }}
        onConfirm={onLeaveGroup}
      />

      <DeleteGroupDialog
        open={dialog.type === 'delete'}
        onOpenChange={(open) => { if (!open) close() }}
        onConfirm={onDeleteGroup}
      />

      <KickMemberDialog
        memberName={dialog.type === 'kick' ? dialog.member.displayName : undefined}
        open={dialog.type === 'kick'}
        onOpenChange={(open) => { if (!open) close() }}
        onConfirm={() => { if (dialog.type === 'kick') { onKickMember(dialog.member.id); close() } }}
      />

      <DeleteHistoryDialog
        gameName={dialog.type === 'deleteHistory' ? dialog.entry.winningGameName : undefined}
        open={dialog.type === 'deleteHistory'}
        onOpenChange={(open) => { if (!open) close() }}
        onConfirm={() => { if (dialog.type === 'deleteHistory') { onDeleteHistory(dialog.entry.id); close() } }}
      />

      {/* Form dialogs stay mounted so their open/close transitions play; a
          key tied to the open state re-seeds their fields from the current
          props each time they open (matching the old per-open seeding). */}
      <RenameGroupDialog
        key={`rename-${dialog.type === 'rename'}`}
        open={dialog.type === 'rename'}
        onOpenChange={(open) => { if (!open) close() }}
        groupName={groupName}
        onRename={onRenameGroup}
      />

      <AutoVoteDialog
        key={`autoVote-${dialog.type === 'autoVote'}`}
        open={dialog.type === 'autoVote'}
        onOpenChange={(open) => { if (!open) close() }}
        autoVoteSchedule={autoVoteSchedule}
        autoVoteDurationMinutes={autoVoteDurationMinutes}
        onUpdate={onUpdateAutoVote}
      />

      <ReleasesDigestDialog
        key={`digest-${dialog.type === 'digest'}`}
        open={dialog.type === 'digest'}
        onOpenChange={(open) => { if (!open) close() }}
        releasesDigestEnabled={releasesDigestEnabled}
        releasesDigestSchedule={releasesDigestSchedule}
        releasesDigestCoopOnly={releasesDigestCoopOnly}
        onUpdate={onUpdateReleasesDigest}
        onTest={onTestReleasesDigest}
      />
    </div>
  )
}
