import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Vote, Loader2, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { api } from '@/lib/api'

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
  onStartVote: (participantIds: string[]) => void
}

type Step = 'select' | 'confirm'

export function VoteSetupDialog({ open, onOpenChange, members, groupId, onlineMembers, activeFilter, onStartVote }: VoteSetupDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select')
      setSelectedIds(new Set(members.map(m => m.id)))
      setPreviewCount(null)
    }
  }, [open, members])

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

  const handleNext = async () => {
    setLoadingPreview(true)
    try {
      const result = await api.previewCommonGames(groupId, Array.from(selectedIds), activeFilter)
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
    onStartVote(Array.from(selectedIds))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {t('voteSetup.title')}
              </DialogTitle>
              <DialogDescription>
                {t('voteSetup.description')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <label htmlFor="select-all" className="flex items-center gap-3 py-1.5 cursor-pointer">
                <Checkbox
                  id="select-all"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  className="size-5"
                />
                <span className="text-sm font-medium text-muted-foreground">{t('voteSetup.selectAll')}</span>
              </label>

              <div className="border-t border-border" />

              <div className="max-h-[50vh] overflow-y-auto space-y-1">
                {sortedMembers.map((member) => {
                  const isOnline = onlineMembers.has(member.id)
                  return (
                    <label key={member.id} htmlFor={`member-${member.id}`} className="flex items-center gap-3 py-1.5 px-1 rounded-md cursor-pointer hover:bg-accent/50">
                      <Checkbox
                        id={`member-${member.id}`}
                        checked={selectedIds.has(member.id)}
                        onCheckedChange={() => toggleMember(member.id)}
                        className="size-5"
                      />
                      <div className="relative">
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                          <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-card ${isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                        />
                      </div>
                      <span className={`text-sm font-medium ${!isOnline ? 'text-muted-foreground' : ''}`}>{member.displayName}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-between items-center mt-4">
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
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" />
                {t('voteSetup.confirmTitle')}
              </DialogTitle>
              <DialogDescription>
                {previewCount !== null
                  ? t('voteSetup.confirmDescription', { players: selectedIds.size, games: previewCount })
                  : t('voteSetup.confirmDescriptionNoPreview', { players: selectedIds.size })
                }
              </DialogDescription>
            </DialogHeader>

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
                {t('voteSetup.gameSelectionHint', { max: Math.min(previewCount, 20), total: previewCount })}
              </p>
            )}

            <div className="flex gap-3 mt-4 justify-between">
              <Button variant="ghost" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('voteSetup.back')}
              </Button>
              <Button onClick={handleConfirm}>
                {t('voteSetup.startVote')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
