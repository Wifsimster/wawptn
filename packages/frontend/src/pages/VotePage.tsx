import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ThumbsUp, ThumbsDown, Check, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'

interface Game {
  steamAppId: number
  gameName: string
  headerImageUrl: string
}

interface VoteResult {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  yesCount: number
  totalVoters: number
}

export function VotePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [session, setSession] = useState<{ id: string; createdBy: string } | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [myVotes, setMyVotes] = useState<Map<number, boolean>>(new Map())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [voterCount, setVoterCount] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)
  const [result, setResult] = useState<VoteResult | null>(null)
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    if (!id) return
    loadSession(id)

    const socket = getSocket()
    socket.emit('group:join', id)

    socket.on('vote:cast', (data) => {
      setVoterCount(data.voterCount)
    })

    socket.on('vote:closed', (data) => {
      setResult(data.result)
    })

    return () => {
      socket.emit('group:leave', id)
      socket.off('vote:cast')
      socket.off('vote:closed')
    }
  }, [id])

  const loadSession = async (groupId: string) => {
    try {
      const data = await api.getVoteSession(groupId)
      if (!data.session) {
        navigate(`/groups/${groupId}`)
        return
      }
      setSession({ id: data.session.id, createdBy: data.session.createdBy })
      setGames(data.games)
      setVoterCount(data.voterCount)
      setTotalMembers(data.totalMembers)

      // Restore existing votes
      const votes = new Map<number, boolean>()
      for (const v of data.myVotes) {
        votes.set(v.steamAppId, v.vote)
      }
      setMyVotes(votes)
      if (data.myVotes.length > 0) {
        setHasVoted(true)
      }
    } catch {
      navigate(`/groups/${groupId}`)
    }
  }

  const castVote = useCallback(async (steamAppId: number, vote: boolean) => {
    if (!id || !session) return
    setMyVotes(prev => new Map(prev).set(steamAppId, vote))

    // Send to backend
    try {
      await api.castVote(id, session.id, steamAppId, vote)
    } catch (err) {
      console.error('Failed to cast vote:', err)
    }

    // Move to next game
    if (currentIndex < games.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setHasVoted(true)
    }
  }, [id, session, currentIndex, games.length])

  const handleClose = async () => {
    if (!id || !session) return
    try {
      const data = await api.closeVote(id, session.id)
      setResult(data.result)
    } catch (err) {
      console.error('Failed to close vote:', err)
    }
  }

  const currentGame = games[currentIndex]
  const canClose = session && (session.createdBy === user?.id)

  // Result screen
  if (result) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AnimatePresence>
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.6 }}
            className="text-center max-w-md w-full"
          >
            <p className="text-sm text-muted-foreground mb-4 uppercase tracking-wide">Tonight you're playing</p>
            {result.headerImageUrl && (
              <img
                src={result.headerImageUrl}
                alt={result.gameName}
                className="w-full rounded-lg shadow-2xl mb-6"
              />
            )}
            <h1 className="text-3xl font-bold mb-2">{result.gameName}</h1>
            <p className="text-muted-foreground mb-8">
              {result.yesCount} out of {result.totalVoters} voted for this
            </p>

            {result.steamAppId && (
              <a
                href={`steam://run/${result.steamAppId}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-steam text-white rounded-lg hover:bg-steam-light transition-colors text-lg font-medium"
              >
                <ExternalLink className="w-5 h-5" />
                Launch in Steam
              </a>
            )}

            <button
              onClick={() => navigate(`/groups/${id}`)}
              className="block mx-auto mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to group
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // Waiting screen (already voted)
  if (hasVoted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Check className="w-16 h-16 text-success mb-4" />
        <h2 className="text-2xl font-bold mb-2">Vote submitted!</h2>
        <p className="text-muted-foreground mb-6">
          Waiting for others... {voterCount} of {totalMembers} have voted
        </p>

        <div className="w-48 h-2 bg-secondary rounded-full overflow-hidden mb-8">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${totalMembers > 0 ? (voterCount / totalMembers) * 100 : 0}%` }}
          />
        </div>

        {canClose && (
          <button
            onClick={handleClose}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Close Vote & Reveal Winner
          </button>
        )}

        <button
          onClick={() => navigate(`/groups/${id}`)}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to group
        </button>
      </div>
    )
  }

  // Voting interface
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border p-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button onClick={() => navigate(`/groups/${id}`)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {games.length}
          </span>
          <div className="text-sm text-muted-foreground">
            {voterCount}/{totalMembers} voted
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        {currentGame && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentGame.steamAppId}
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full"
            >
              <div className="bg-card rounded-lg border border-border overflow-hidden shadow-xl">
                <img
                  src={currentGame.headerImageUrl}
                  alt={currentGame.gameName}
                  className="w-full aspect-[460/215] object-cover"
                />
                <div className="p-4">
                  <h2 className="text-xl font-bold text-center">{currentGame.gameName}</h2>
                </div>
              </div>

              <div className="flex justify-center gap-8 mt-8">
                <button
                  onClick={() => castVote(currentGame.steamAppId, false)}
                  className="w-16 h-16 rounded-full bg-destructive/20 hover:bg-destructive/40 flex items-center justify-center transition-colors"
                >
                  <ThumbsDown className="w-7 h-7 text-destructive" />
                </button>
                <button
                  onClick={() => castVote(currentGame.steamAppId, true)}
                  className="w-16 h-16 rounded-full bg-success/20 hover:bg-success/40 flex items-center justify-center transition-colors"
                >
                  <ThumbsUp className="w-7 h-7 text-success" />
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}
