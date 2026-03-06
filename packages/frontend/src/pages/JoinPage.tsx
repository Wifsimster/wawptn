import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Gamepad2, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!user || !token) return
    joinGroup()
  }, [user, token])

  const joinGroup = async () => {
    if (!token) return
    setJoining(true)
    try {
      const result = await api.joinGroup(token)
      navigate(`/groups/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join group')
      setJoining(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <Gamepad2 className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">You've been invited!</h1>
        <p className="text-muted-foreground mb-6">Sign in with Steam to join the group.</p>
        <a
          href="/api/auth/steam/login"
          className="flex items-center gap-3 px-8 py-4 bg-steam hover:bg-steam-light text-white rounded-lg transition-colors text-lg font-medium"
        >
          Sign in with Steam
        </a>
      </div>
    )
  }

  if (joining) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Joining group...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <h1 className="text-2xl font-bold mb-2 text-destructive">Could not join</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <button onClick={() => navigate('/')} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
          Go to my groups
        </button>
      </div>
    )
  }

  return null
}
