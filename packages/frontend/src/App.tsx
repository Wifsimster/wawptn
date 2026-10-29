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

const GroupsPage = lazy(() => import('@/pages/GroupsPage').then((m) => ({ default: m.GroupsPage })))
const GroupPage = lazy(() => import('@/pages/GroupPage').then((m) => ({ default: m.GroupPage })))
const VotePage = lazy(() => import('@/pages/VotePage').then((m) => ({ default: m.VotePage })))
const JoinPage = lazy(() => import('@/pages/JoinPage').then((m) => ({ default: m.JoinPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const MyLibraryPage = lazy(() => import('@/pages/MyLibraryPage').then((m) => ({ default: m.MyLibraryPage })))
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })))
const ComparePage = lazy(() => import('@/pages/ComparePage').then((m) => ({ default: m.ComparePage })))
const DiscordLinkPage = lazy(() => import('@/pages/DiscordLinkPage').then((m) => ({ default: m.DiscordLinkPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })))
const ContactPage = lazy(() => import('@/pages/ContactPage').then((m) => ({ default: m.ContactPage })))

const DialogTestPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/DialogTestPage').then((m) => ({ default: m.DialogTestPage })))
  : null

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user?.isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function InviteRedirect() {
  const { token } = useParams<{ token: string }>()
  if (!token) return <Navigate to="/" replace />
  return <Navigate to={`/join/${token}`} replace />
}

function VoteRoute() {
  const { id } = useParams<{ id: string }>()
  return <VotePage key={id} />
}

function App() {
  const { user, loading, fetchUser } = useAuthStore()

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (user) {
      connectSocket()
      void useWishlistStore.getState().fetch()
    } else {
      disconnectSocket()
      useNotificationStore.getState().clear()
      useWishlistStore.getState().clear()
    }
    return () => disconnectSocket()
  }, [user])

  useNotificationListener()

  useChallengeListener()

  useActiveVoteSync()

  usePwaInstallPrompt()

  useSocketConnectionStatus()

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
      <output
        className="min-h-dvh flex flex-col items-center justify-center gap-4"
        aria-busy="true"
        aria-live="polite"
        aria-label="Chargement de l'application"
      >
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </output>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/invite/:token" element={<InviteRedirect />} />
          <Route path="/discord/link" element={<DiscordLinkPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<GroupsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/library" element={<MyLibraryPage />} />
            <Route path="/u/:userId" element={<UserProfilePage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="/groups/:id" element={<GroupPage />} />
          </Route>
          <Route path="/groups/:id/vote" element={<VoteRoute />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/invite/:token" element={<InviteRedirect />} />
          <Route path="/discord/link" element={<DiscordLinkPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <KoeSupport />
    </>
  )
}

function RouteFallback() {
  return (
    <output
      className="min-h-dvh flex flex-col items-center justify-center gap-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="Chargement de la page"
    >
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-4 w-32" />
    </output>
  )
}

export default App
