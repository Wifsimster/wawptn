import { useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { InviteLink } from '@/components/invite-link'

interface CreateState {
  groupName: string
  inviteResult: string | null
  createdGroupId: string | null
  createError: string | null
}

type CreateAction =
  | { type: 'setName'; name: string }
  | { type: 'setError'; error: string | null }
  | { type: 'created'; inviteToken: string; id: string }
  | { type: 'reset' }

const createInitialState: CreateState = {
  groupName: '',
  inviteResult: null,
  createdGroupId: null,
  createError: null,
}

function createReducer(state: CreateState, action: CreateAction): CreateState {
  switch (action.type) {
    case 'setName':
      return { ...state, groupName: action.name, createError: null }
    case 'setError':
      return { ...state, createError: action.error }
    case 'created':
      return { ...state, groupName: '', inviteResult: action.inviteToken, createdGroupId: action.id }
    case 'reset':
      return createInitialState
    default:
      return state
  }
}

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupCount: number
}

export function CreateGroupDialog({ open, onOpenChange, groupCount }: CreateGroupDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createGroup, fetchGroups } = useGroupStore()
  const [state, dispatch] = useReducer(createReducer, createInitialState)
  const { groupName, inviteResult, createdGroupId, createError } = state

  const handleCreate = async () => {
    if (!groupName.trim()) {
      dispatch({ type: 'setError', error: t('createGroup.required') })
      return
    }
    dispatch({ type: 'setError', error: null })
    try {
      const result = await createGroup({ name: groupName.trim() })
      dispatch({ type: 'created', inviteToken: result.inviteToken, id: result.id })
      fetchGroups()
      toast.success(t('createGroup.success'))
      track('group.created', { fromEmptyState: groupCount === 0 })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        track('group.create_failed', { reason: 'premium_required' })
        track('premium.upgrade_clicked', { from: 'group_limit' })
        toast.error(t('premium.groupLimitReached', { max: 2 }))
        navigate('/subscription?from=group_limit')
        return
      }
      const msg = err instanceof Error ? err.message : t('createGroup.error')
      dispatch({ type: 'setError', error: msg })
      track('group.create_failed', { reason: 'error' })
      toast.error(msg, {
        action: {
          label: t('common.retry'),
          onClick: () => handleCreate(),
        },
      })
    }
  }

  const handleFinishCreate = () => {
    const id = createdGroupId
    onOpenChange(false)
    dispatch({ type: 'reset' })
    if (id) navigate(`/groups/${id}`)
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
          <ResponsiveDialogTitle>
            {inviteResult ? t('createGroup.inviteReadyTitle') : t('createGroup.title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {inviteResult ? t('createGroup.inviteReadyHint') : t('createGroup.description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {!inviteResult && (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="group-name" className="text-sm font-medium">
                {t('createGroup.label')}
              </label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(e) => dispatch({ type: 'setName', name: e.target.value })}
                placeholder={t('createGroup.placeholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                maxLength={100}
                autoFocus
                autoComplete="off"
                enterKeyHint="done"
                aria-invalid={!!createError}
                aria-describedby={createError ? 'group-name-error' : undefined}
              />
              {createError && (
                <p id="group-name-error" role="alert" className="text-sm text-destructive">
                  {createError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t('common.cancel', 'Annuler')}
              </Button>
              <Button onClick={handleCreate}>{t('createGroup.submit')}</Button>
            </div>
          </div>
        )}
        {inviteResult && (
          <InviteLink
            token={inviteResult}
            prominent
            onContinue={handleFinishCreate}
            continueLabel={t('createGroup.goToGroup')}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
