import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LazyMotion, domMax } from 'framer-motion'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/error-boundary'
import { PwaUpdatePanel } from '@/components/pwa-update-panel'
import { AuroraBackground } from '@/components/aurora-background'
import App from './App'
import './i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LazyMotion features={domMax}>
        <TooltipProvider delayDuration={300}>
          <AuroraBackground />
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <PwaUpdatePanel />
          <Toaster
            theme="dark"
            position="bottom-center"
            toastOptions={{
              style: {
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--card-foreground)',
              },
            }}
            containerAriaLabel="Notifications"
          />
        </TooltipProvider>
      </LazyMotion>
    </BrowserRouter>
  </StrictMode>,
)
