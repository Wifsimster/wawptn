import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Gamepad2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const joining = !!user && !!token && !error

  useEffect(() => {
    if (!user || !token) return
    let cancelled = false

    api.joinGroup(token).then(
      (result) => {
        if (cancelled) return
        toast.success('Groupe rejoint !')
        navigate(`/groups/${result.id}`)
      },
      (err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Impossible de rejoindre le groupe')
      }
    )

    return () => { cancelled = true }
  }, [user, token, navigate])

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <Gamepad2 className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">Tu as ete invite !</h1>
        <p className="text-muted-foreground mb-6">Connecte-toi avec Steam pour rejoindre le groupe.</p>
        <Button variant="steam" size="lg" asChild>
          <a href="/api/auth/steam/login">Sign in with Steam</a>
        </Button>
      </div>
    )
  }

  if (joining) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Connexion au groupe...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <h1 className="text-2xl font-bold mb-2 text-destructive">Impossible de rejoindre</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => navigate('/')}>Aller a mes groupes</Button>
      </div>
    )
  }

  return null
}
