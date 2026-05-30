import { useState } from 'react'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import { CronAutocomplete } from '@/components/cron-autocomplete'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function LeaveGroupDialog({ open, onOpenChange, onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.leaveConfirmTitle')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.leaveConfirmDescription')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
          <Button variant="destructive" onClick={() => { onOpenChange(false); onConfirm() }}>{t('group.leaveGroup')}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

export function DeleteGroupDialog({ open, onOpenChange, onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.deleteConfirmTitle')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.deleteConfirmDescription')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
          <Button variant="destructive" onClick={() => { onOpenChange(false); onConfirm() }}>{t('group.deleteGroup')}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface KickDialogProps {
  memberName: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function KickMemberDialog({ memberName, open, onOpenChange, onConfirm }: KickDialogProps) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.kickConfirmTitle')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.kickConfirmDescription', { name: memberName })}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
          <Button variant="destructive" onClick={onConfirm}>{t('group.kickConfirm')}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface DeleteHistoryDialogProps {
  gameName: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteHistoryDialog({ gameName, open, onOpenChange, onConfirm }: DeleteHistoryDialogProps) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.deleteHistoryConfirmTitle')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.deleteHistoryConfirmDescription', { name: gameName })}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
          <Button variant="destructive" onClick={onConfirm}>{t('group.deleteHistoryConfirm')}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface RenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  onRename: (name: string) => Promise<void>
}

export function RenameGroupDialog({ open, onOpenChange, groupName, onRename }: RenameDialogProps) {
  const { t } = useTranslation()
  // Seeded once from the prop; the parent remounts via `key` to re-seed.
  const [renameName, setRenameName] = useState(() => groupName)
  const [renaming, setRenaming] = useState(false)

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.renameTitle')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.renameDescription')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (!renameName.trim() || renaming) return
          setRenaming(true)
          try {
            await onRename(renameName.trim())
            onOpenChange(false)
          } finally {
            setRenaming(false)
          }
        }}>
          <div className="px-4 pb-4">
            <label htmlFor="rename-input" className="text-sm font-medium mb-2 block">{t('group.renameLabel')}</label>
            <Input
              id="rename-input"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder={t('group.renamePlaceholder')}
              maxLength={100}
              autoFocus
              autoComplete="off"
              enterKeyHint="done"
            />
          </div>
          <ResponsiveDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
            <Button type="submit" disabled={!renameName.trim() || renameName.trim() === groupName || renaming}>{t('group.renameSubmit')}</Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface AutoVoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  autoVoteSchedule: string | null
  autoVoteDurationMinutes: number
  onUpdate: (schedule: string | null, durationMinutes: number) => Promise<void>
}

export function AutoVoteDialog({ open, onOpenChange, autoVoteSchedule, autoVoteDurationMinutes, onUpdate }: AutoVoteDialogProps) {
  const { t } = useTranslation()
  // Seeded once from props; the parent remounts via `key` to re-seed.
  const [autoVoteCron, setAutoVoteCron] = useState(() => autoVoteSchedule || '')
  const [autoVoteDuration, setAutoVoteDuration] = useState(() => autoVoteDurationMinutes)
  const [autoVoteSaving, setAutoVoteSaving] = useState(false)

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.autoVote')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.autoVoteHint')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (autoVoteSaving) return
          setAutoVoteSaving(true)
          try {
            await onUpdate(autoVoteCron.trim() || null, autoVoteDuration)
            onOpenChange(false)
          } finally {
            setAutoVoteSaving(false)
          }
        }}>
          <div className="px-4 pb-4 space-y-4">
            <div>
              <label htmlFor="auto-vote-cron" className="text-sm font-medium mb-2 block">{t('group.autoVoteSchedule')}</label>
              <CronAutocomplete
                id="auto-vote-cron"
                value={autoVoteCron}
                onChange={setAutoVoteCron}
                placeholder={t('group.autoVotePlaceholder')}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">{t('group.autoVoteHint')}</p>
            </div>
            <div>
              <label htmlFor="auto-vote-duration" className="text-sm font-medium mb-2 block">{t('group.autoVoteDuration')}</label>
              <div className="flex gap-2">
                {[
                  { value: 30, label: t('group.autoVoteDuration30') },
                  { value: 60, label: t('group.autoVoteDuration60') },
                  { value: 120, label: t('group.autoVoteDuration120') },
                  { value: 180, label: t('group.autoVoteDuration180') },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={autoVoteDuration === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAutoVoteDuration(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <ResponsiveDialogFooter>
            {autoVoteCron.trim() && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  setAutoVoteSaving(true)
                  try {
                    await onUpdate(null, autoVoteDuration)
                    setAutoVoteCron('')
                    onOpenChange(false)
                  } finally {
                    setAutoVoteSaving(false)
                  }
                }}
                disabled={autoVoteSaving}
              >
                {t('group.autoVoteDisabled')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
            <Button type="submit" disabled={!autoVoteCron.trim() || autoVoteSaving}>{t('group.autoVoteSave')}</Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface DigestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  releasesDigestEnabled: boolean
  releasesDigestSchedule: string
  releasesDigestCoopOnly: boolean
  onUpdate: (input: { enabled: boolean; schedule: string; coopOnly: boolean }) => Promise<void>
  onTest: () => Promise<void>
}

export function ReleasesDigestDialog({ open, onOpenChange, releasesDigestEnabled, releasesDigestSchedule, releasesDigestCoopOnly, onUpdate, onTest }: DigestDialogProps) {
  const { t } = useTranslation()
  // Seeded once from props; the parent remounts via `key` to re-seed.
  const [digestCron, setDigestCron] = useState(() => releasesDigestSchedule || '0 21 * * 5')
  const [digestCoopOnly, setDigestCoopOnly] = useState(() => releasesDigestCoopOnly)
  const [digestSaving, setDigestSaving] = useState(false)
  const [digestTesting, setDigestTesting] = useState(false)

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.releasesDigest')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.releasesDigestHint')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (digestSaving || !digestCron.trim()) return
          setDigestSaving(true)
          try {
            await onUpdate({ enabled: true, schedule: digestCron.trim(), coopOnly: digestCoopOnly })
            onOpenChange(false)
          } finally {
            setDigestSaving(false)
          }
        }}>
          <div className="px-4 pb-4 space-y-4">
            <div>
              <label htmlFor="digest-cron" className="text-sm font-medium mb-2 block">{t('group.releasesDigestSchedule')}</label>
              <CronAutocomplete
                id="digest-cron"
                value={digestCron}
                onChange={setDigestCron}
                placeholder="0 21 * * 5"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('group.releasesDigestFilter')}</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={!digestCoopOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDigestCoopOnly(false)}
                >
                  {t('group.releasesDigestFilterAll')}
                </Button>
                <Button
                  type="button"
                  variant={digestCoopOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDigestCoopOnly(true)}
                >
                  {t('group.releasesDigestFilterCoop')}
                </Button>
              </div>
            </div>
          </div>
          <ResponsiveDialogFooter>
            {releasesDigestEnabled && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  setDigestSaving(true)
                  try {
                    await onUpdate({ enabled: false, schedule: digestCron.trim() || '0 21 * * 5', coopOnly: digestCoopOnly })
                    onOpenChange(false)
                  } finally {
                    setDigestSaving(false)
                  }
                }}
                disabled={digestSaving}
              >
                {t('group.releasesDigestDisable')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (digestTesting) return
                setDigestTesting(true)
                try {
                  await onTest()
                } finally {
                  setDigestTesting(false)
                }
              }}
              disabled={digestTesting || digestSaving}
            >
              <Send className={`size-4 mr-2 ${digestTesting ? 'animate-pulse' : ''}`} />
              {t('group.releasesDigestTest')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('group.cancel')}</Button>
            <Button type="submit" disabled={!digestCron.trim() || digestSaving}>
              {releasesDigestEnabled ? t('group.releasesDigestSave') : t('group.releasesDigestEnable')}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
