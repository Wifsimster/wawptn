import { Component, type ErrorInfo, type ReactNode } from 'react'
import { withTranslation, type WithTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface Props extends WithTranslation {
  children: ReactNode
}

interface State {
  hasError: boolean
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the underlying error so it shows up in the browser console
    // instead of being silently swallowed by the boundary.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { t } = this.props

    if (this.state.hasError) {
      return (
        <main id="main-content" role="alert" className="min-h-screen flex flex-col items-center justify-center px-4">
          <h1 className="text-2xl font-bold mb-2">{t('error.title', "Oups, quelque chose s'est mal passe")}</h1>
          <p className="text-muted-foreground mb-6">{t('error.description', 'Une erreur inattendue est survenue.')}</p>
          <Button type="button" onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}>
            {t('error.backHome', "Retour a l'accueil")}
          </Button>
        </main>
      )
    }

    return this.props.children
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner)
