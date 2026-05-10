import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/error-boundary'
import { PwaUpdatePanel } from '@/components/pwa-update-panel'
import App from './App'
import './i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
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
    </BrowserRouter>
  </StrictMode>,
)
