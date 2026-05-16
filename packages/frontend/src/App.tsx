import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotificationListener } from '@/hooks/useNotificationListener'
import { useChallengeListener } from '@/hooks/useChallengeListener'
import { useActiveVoteSync } from '@/hooks/useActiveVoteSync'
import { usePwaInstallPrompt } from '@/hooks/usePwaInstallPrompt'
import { useSocketConnectionStatus } from '@/hooks/useSocketConnectionStatus'
import { useNotificationStore } from '@/stores/notification.store'
import { useWishlistStore } from '@/stores/wishlist.store'
import { KoeSupport } from '@/components/KoeSupport'
import { AppLayout } from '@/components/app-layout'

// Route-level code splitting. Keeps LandingPage (LCP target) and
// NotFoundPage eager; everything else loads on demand so the first paint
// for an unauthenticated visitor doesn't ship VotePage + framer-motion.
const GroupsPage = lazy(() => import('@/pages/GroupsPage').then((m) => ({ default: m.GroupsPage })))
const GroupPage = lazy(() => import('@/pages/GroupPage').then((m) => ({ default: m.GroupPage })))
const VotePage = lazy(() => import('@/pages/VotePage').then((m) => ({ default: m.VotePage })))
const JoinPage = lazy(() => import('@/pages/JoinPage').then((m) => ({ default: m.JoinPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const ComparePage = lazy(() => import('@/pages/ComparePage').then((m) => ({ default: m.ComparePage })))
const DiscordLinkPage = lazy(() => import('@/pages/DiscordLinkPage').then((m) => ({ default: m.DiscordLinkPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })))

// Dev-only sandbox; lazy + DEV-gated so it never ships in the prod bundle.
const DialogTestPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/DialogTestPage').then((m) => ({ default: m.DialogTestPage })))
  : null

/** Synchronous admin guard. Wraps protected admin routes so a non-admin
 *  user is redirected before the page mounts and runs its data-loading
 *  effects (which would otherwise hit /api/admin endpoints and rely on
 *  the server's 403 to bounce them). */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user?.isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Bridges the OG-rich `/invite/:token` URL (used in Discord/Slack/Twitter
 *  unfurls) onto the SPA's `/join/:token` route. The server handles the
 *  unauthenticated meta-tag preview directly; this client-side component
 *  just guarantees that an authenticated user clicking the link from a
 *  rich embed lands on the join screen instead of the 404 fallback. */
function InviteRedirect() {
  const { token } = useParams<{ token: string }>()
  if (!token) return <Navigate to="/" replace />
  return <Navigate to={`/join/${token}`} replace />
}

function App() {
  const { user, loading, fetchUser } = useAuthStore()

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (user) {
      connectSocket()
      // Seed the wishlist store for authenticated users so every game
      // card renders with the correct star state on first paint.
      void useWishlistStore.getState().fetch()
    } else {
      disconnectSocket()
      useNotificationStore.getState().clear()
      useWishlistStore.getState().clear()
    }
    return () => disconnectSocket()
  }, [user])

  // Global notification listener (only when authenticated)
  useNotificationListener()

  // Global challenge unlock listener
  useChallengeListener()

  // Keeps the group list fresh so the app-wide "vote in progress" banner
  // reacts to votes starting / closing in any of the user's groups.
  useActiveVoteSync()

  // PWA install prompt — captures beforeinstallprompt and surfaces a
  // sonner toast with a native install action.
  usePwaInstallPrompt()

  // Socket connection status tracking — binds the socket store to the
  // socket.io client's lifecycle events and pops a sonner toast on
  // disconnect / reconnect so users aren't left guessing why events
  // have stopped arriving.
  useSocketConnectionStatus()

  // Dev-only dialog test page (no auth required)
  if (import.meta.env.DEV && DialogTestPage && window.location.pathname === '/test-dialogs') {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/test-dialogs" element={<DialogTestPage />} />
        </Routes>
      </Suspense>
    )
  }

  if (loading) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-4"
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="Chargement de l'application"
      >
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          {/* /invite/:token is the OG-rich URL surfaced by InviteLink — point
              it at the SPA join page so a deep-linked invitee from Discord
              doesn't hit the 404 fallback. */}
          <Route path="/invite/:token" element={<InviteRedirect />} />
          <Route path="/discord/link" element={<DiscordLinkPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Standard pages — wrapped in the shared AppLayout shell
              (persistent header + footer + header slot). */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<GroupsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/u/:userId" element={<UserProfilePage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="/groups/:id" element={<GroupPage />} />
          </Route>
          {/* Full-screen / chrome-less routes — own their own layout. */}
          <Route path="/groups/:id/vote" element={<VotePage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/invite/:token" element={<InviteRedirect />} />
          <Route path="/discord/link" element={<DiscordLinkPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <KoeSupport />
    </>
  )
}

function RouteFallback() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-4"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Chargement de la page"
    >
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-4 w-32" />
    </div>
  )
}

export default App
