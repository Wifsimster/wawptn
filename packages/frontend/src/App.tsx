import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { LoginPage } from '@/pages/LoginPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { GroupPage } from '@/pages/GroupPage'
import { VotePage } from '@/pages/VotePage'
import { JoinPage } from '@/pages/JoinPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { DiscordLinkPage } from '@/pages/DiscordLinkPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { Skeleton } from '@/components/ui/skeleton'
import { DialogTestPage } from '@/pages/DialogTestPage'

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
    }
    return () => disconnectSocket()
  }, [user])

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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/discord/link" element={<DiscordLinkPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<GroupsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/groups/:id" element={<GroupPage />} />
      <Route path="/groups/:id/vote" element={<VotePage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/discord/link" element={<DiscordLinkPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
