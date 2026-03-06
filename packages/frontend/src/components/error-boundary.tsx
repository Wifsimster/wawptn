import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
          <h1 className="text-2xl font-bold mb-2">Oups, quelque chose s'est mal passé</h1>
          <p className="text-muted-foreground mb-6">Une erreur inattendue est survenue.</p>
          <Button onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}>
            Retour à l'accueil
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
