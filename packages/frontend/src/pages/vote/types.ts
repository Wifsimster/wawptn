export interface Game {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string
  shortDescription?: string | null
  genres?: { id: string; description: string }[] | null
  metacriticScore?: number | null
  platforms?: { windows: boolean; mac: boolean; linux: boolean } | null
  releaseDate?: string | null
  controllerSupport?: string | null
  isFree?: boolean | null
  type?: string | null
}

export interface VoteResult {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
  yesCount: number
  totalVoters: number
}

export interface SessionMeta {
  id: string
  createdBy: string
  scheduledAt: string | null
}
