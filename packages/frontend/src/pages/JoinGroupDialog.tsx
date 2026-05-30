import { useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardPaste } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api'
import { track } from '@/lib/analytics'
import { useGroupStore } from '@/stores/group.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'

function extractInviteToken(raw: string): string {
  const input = raw.trim()
  if (!input) return input
  const urlMatch = input.match(/\/invite\/([A-Za-z0-9_-]+)/)
  if (urlMatch && urlMatch[1]) return urlMatch[1]
  return input
}

interface JoinState {
  inviteToken: string
  joinError: string | null
}

type JoinAction =
  | { type: 'setToken'; token: string }
  | { type: 'setError'; error: string | null }
  | { type: 'reset' }

const joinInitialState: JoinState = {
  inviteToken: '',
  joinError: null,
}

function joinReducer(state: JoinState, action: JoinAction): JoinState {
  switch (action.type) {
    case 'setToken':
      return { ...state, inviteToken: action.token, joinError: null }
    case 'setError':
      return { ...state, joinError: action.error }
    case 'reset':
      return joinInitialState
    default:
      return state
  }
}

interface JoinGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function JoinGroupDialog({ open, onOpenChange }: JoinGroupDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { joinGroup, fetchGroups } = useGroupStore()
  const [state, dispatch] = useReducer(joinReducer, joinInitialState)
  const { inviteToken, joinError } = state

  const handleJoin = async () => {
    const token = extractInviteToken(inviteToken)
    if (!token) {
      dispatch({ type: 'setError', error: t('joinGroup.required') })
      return
    }
    dispatch({ type: 'setError', error: null })
    try {
      const result = await joinGroup(token)
      dispatch({ type: 'reset' })
      onOpenChange(false)
      fetchGroups()
      navigate(result.activeVoteSession ? `/groups/${result.id}/vote` : `/groups/${result.id}`)
      toast.success(t('joinGroup.success'))
      track('group.joined')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        track('group.join_failed', { reason: 'premium_required' })
        toast.error(t('premium.memberLimitReached', { max: 8 }))
        return
      }
      const msg = err instanceof Error ? err.message : t('joinGroup.error')
      dispatch({ type: 'setError', error: msg })
      track('group.join_failed', { reason: 'error' })
      toast.error(msg, {
        action: {
          label: t('common.retry'),
          onClick: () => handleJoin(),
        },
      })
    }
  }

  const handlePasteInvite = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        dispatch({ type: 'setToken', token: text })
      }
    } catch {
      toast.error(t('joinGroup.pasteError'))
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) dispatch({ type: 'reset' })
      }}
    >
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('joinGroup.title')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('joinGroup.description')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="mt-4 space-y-2">
          <label htmlFor="invite-token" className="text-sm font-medium">
            {t('joinGroup.label')}
          </label>
          <div className="flex gap-2">
            <Input
              id="invite-token"
              value={inviteToken}
              onChange={(e) => dispatch({ type: 'setToken', token: e.target.value })}
              placeholder={t('joinGroup.placeholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              maxLength={512}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="go"
              aria-invalid={!!joinError}
              aria-describedby={joinError ? 'invite-token-error' : undefined}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handlePasteInvite}
              aria-label={t('joinGroup.paste')}
              title={t('joinGroup.paste')}
            >
              <ClipboardPaste className="size-4" />
            </Button>
            <Button onClick={handleJoin}>{t('joinGroup.submit')}</Button>
          </div>
          {joinError && (
            <p id="invite-token-error" role="alert" className="text-sm text-destructive">
              {joinError}
            </p>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
