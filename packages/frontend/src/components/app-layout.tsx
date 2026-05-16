import { Suspense, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { ActiveVoteBanner } from '@/components/active-vote-banner'
import { Skeleton } from '@/components/ui/skeleton'

interface HeaderSlot {
  element: HTMLElement | null
  setHasContent: (value: boolean) => void
}

const HeaderSlotContext = createContext<HeaderSlot | null>(null)

/**
 * Portals page-specific header content (back buttons, page titles) into the
 * single shared AppHeader rendered by AppLayout. A page renders
 * `<PageHeader>...</PageHeader>` anywhere in its tree and the content lands in
 * the global header. Renders nothing in place; renders nothing at all until
 * the layout's slot element has mounted.
 */
export function PageHeader({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext)
  const setHasContent = slot?.setHasContent

  useEffect(() => {
    setHasContent?.(true)
    return () => setHasContent?.(false)
  }, [setHasContent])

  return slot?.element ? createPortal(children, slot.element) : null
}

function RouteFallback() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 py-20"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-4 w-32" />
    </div>
  )
}

/**
 * Shared chrome for every standard authenticated page: one persistent
 * AppHeader + AppFooter wrapping a router `<Outlet>`. Pages no longer
 * hand-roll the `min-h-dvh` wrapper or mount their own header/footer — they
 * render only their `<main>` and (optionally) a `<PageHeader>`.
 */
export function AppLayout() {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [hasContent, setHasContent] = useState(false)
  const slot = useMemo<HeaderSlot>(() => ({ element, setHasContent }), [element])

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <AppHeader maxWidth="wide" hasPageContent={hasContent}>
        <span ref={setElement} className="contents" />
      </AppHeader>
      <ActiveVoteBanner />
      <HeaderSlotContext.Provider value={slot}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </HeaderSlotContext.Provider>
      <AppFooter />
    </div>
  )
}
