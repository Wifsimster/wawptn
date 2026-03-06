import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface InviteLinkProps {
  token: string
}

export function InviteLink({ token }: InviteLinkProps) {
  const url = `${window.location.origin}/join/${token}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Lien copie !')
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast.success('Lien copie !')
    }
  }

  return (
    <div className="mt-3 p-3 bg-background rounded-md border border-border">
      <p className="text-xs text-muted-foreground mb-1">Partage ce lien avec tes amis :</p>
      <div className="flex gap-2">
        <code className="flex-1 text-xs bg-secondary px-2 py-1.5 rounded break-all">
          {url}
        </code>
        <Button size="sm" onClick={handleCopy}>
          Copier
        </Button>
      </div>
    </div>
  )
}
