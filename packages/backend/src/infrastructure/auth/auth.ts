// Auth is handled via custom Steam OpenID routes (auth.routes.ts)
// and custom session management (sessions table via Knex).
// No external auth library needed.

export type AuthUser = {
  id: string
  steamId: string
  displayName: string
  avatarUrl: string
  libraryVisible: boolean
}
