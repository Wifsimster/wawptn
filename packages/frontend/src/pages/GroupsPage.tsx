import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gamepad2, Plus, LogIn, LogOut, Users } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useGroupStore } from '@/stores/group.store'

export function GroupsPage() {
  const { user, logout } = useAuthStore()
  const { groups, loading, fetchGroups, createGroup, joinGroup } = useGroupStore()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [inviteResult, setInviteResult] = useState<string | null>(null)

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const handleCreate = async () => {
    if (!groupName.trim()) return
    const result = await createGroup(groupName.trim())
    setInviteResult(result.inviteToken)
    setGroupName('')
    fetchGroups()
  }

  const handleJoin = async () => {
    if (!inviteToken.trim()) return
    const result = await joinGroup(inviteToken.trim())
    setInviteToken('')
    setShowJoin(false)
    fetchGroups()
    navigate(`/groups/${result.id}`)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // If user has exactly one group, redirect to it
  useEffect(() => {
    if (!loading && groups.length === 1 && groups[0]) {
      navigate(`/groups/${groups[0].id}`, { replace: true })
    }
  }, [loading, groups, navigate])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">WAWPTN</span>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                <span className="text-sm text-muted-foreground">{user.displayName}</span>
              </>
            )}
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">My Groups</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false) }}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors text-sm"
            >
              <LogIn className="w-4 h-4" />
              Join
            </button>
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
          </div>
        </div>

        {/* Create Group Form */}
        {showCreate && (
          <div className="mb-6 p-4 bg-card rounded-lg border border-border">
            <h3 className="font-semibold mb-3">Create a Group</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name..."
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <button onClick={handleCreate} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/80">
                Create
              </button>
            </div>
            {inviteResult && (
              <div className="mt-3 p-3 bg-background rounded border border-border">
                <p className="text-sm text-muted-foreground mb-1">Share this invite link with your friends:</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-secondary px-2 py-1 rounded break-all">
                    {window.location.origin}/join/{inviteResult}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${inviteResult}`)}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/80"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Join Group Form */}
        {showJoin && (
          <div className="mb-6 p-4 bg-card rounded-lg border border-border">
            <h3 className="font-semibold mb-3">Join a Group</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste invite token..."
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <button onClick={handleJoin} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/80">
                Join
              </button>
            </div>
          </div>
        )}

        {/* Groups List */}
        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No groups yet</h3>
            <p className="text-muted-foreground mb-6">Create a group and invite your friends to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="w-full text-left p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{group.name}</h3>
                    <p className="text-sm text-muted-foreground">{group.role}</p>
                  </div>
                  <Gamepad2 className="w-5 h-5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
