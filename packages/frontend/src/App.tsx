import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { GroupPage } from '@/pages/GroupPage'
import { VotePage } from '@/pages/VotePage'
import { JoinPage } from '@/pages/JoinPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { DiscordLinkPage } from '@/pages/DiscordLinkPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AdminPage } from '@/pages/AdminPage'
import { SubscriptionPage } from '@/pages/SubscriptionPage'
import { Skeleton } from '@/components/ui/skeleton'
import { DialogTestPage } from '@/pages/DialogTestPage'
import { useNotificationListener } from '@/hooks/useNotificationListener'
import { useNotificationStore } from '@/stores/notification.store'

function App() {
  const { user, loading, fetchUser } = useAuthStore()

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (user) {
      connectSocket()
    } else {
      disconnectSocket()
      useNotificationStore.getState().clear()
    }
    return () => disconnectSocket()
  }, [user])

  // Global notification listener (only when authenticated)
  useNotificationListener()

  // Dev-only dialog test page (no auth required)
  if (import.meta.env.DEV && window.location.pathname === '/test-dialogs') {
    return (
      <Routes>
        <Route path="/test-dialogs" element={<DialogTestPage />} />
      </Routes>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/discord/link" element={<DiscordLinkPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<GroupsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/subscription" element={<SubscriptionPage />} />
      <Route path="/groups/:id" element={<GroupPage />} />
      <Route path="/groups/:id/vote" element={<VotePage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/discord/link" element={<DiscordLinkPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
