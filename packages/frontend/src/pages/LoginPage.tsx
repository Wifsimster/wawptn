import { Gamepad2 } from 'lucide-react'

export function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Gamepad2 className="w-12 h-12 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">WAWPTN</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-md">
          What Are We Playing Tonight?
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Connect your Steam account, create a group with friends, and vote on tonight's game.
        </p>
      </div>

      <a
        href="/api/auth/steam/login"
        className="flex items-center gap-3 px-8 py-4 bg-steam hover:bg-steam-light text-white rounded-lg transition-colors text-lg font-medium shadow-lg hover:shadow-xl"
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89l-2.568-1.058a2.68 2.68 0 01-1.07-4.32 2.68 2.68 0 013.79 0l.41.41 3-1.75a2.5 2.5 0 114.33 2.5 2.5 2.5 0 01-3.33.83l-3 1.75-.41-.41c-.23-.23-.5-.4-.79-.49v6.59C17.91 18.56 22 14.75 22 12c0-5.523-4.477-10-10-10z" />
        </svg>
        Sign in with Steam
      </a>

      <p className="mt-6 text-xs text-muted-foreground">
        We only access your public profile and game library. No passwords stored.
      </p>
    </div>
  )
}
