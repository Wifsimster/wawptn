import { test as base, type Page } from '@playwright/test'

// ── Mock data ──────────────────────────────────────────────────────

export const mockUser = {
  id: 'user-1',
  steamId: '76561198000000001',
  displayName: 'TestPlayer',
  avatarUrl: 'https://avatars.steamstatic.com/placeholder.jpg',
  libraryVisible: true,
}

export const mockMembers = [
  { id: 'user-1', steamId: '76561198000000001', displayName: 'TestPlayer', avatarUrl: 'https://avatars.steamstatic.com/p1.jpg', libraryVisible: true, role: 'owner', joinedAt: '2025-01-01' },
  { id: 'user-2', steamId: '76561198000000002', displayName: 'Alice', avatarUrl: 'https://avatars.steamstatic.com/p2.jpg', libraryVisible: true, role: 'member', joinedAt: '2025-01-02' },
  { id: 'user-3', steamId: '76561198000000003', displayName: 'Bob', avatarUrl: 'https://avatars.steamstatic.com/p3.jpg', libraryVisible: false, role: 'member', joinedAt: '2025-01-03' },
]

export const mockGroups = [
  { id: 'group-1', name: 'Les Gamers', role: 'owner', createdAt: '2025-01-01', memberCount: 3, commonGameCount: 42, lastSession: { gameName: 'Counter-Strike 2', gameAppId: 730, closedAt: '2025-03-01' } },
  { id: 'group-2', name: 'Squad B', role: 'member', createdAt: '2025-02-01', memberCount: 5, commonGameCount: 18, lastSession: null },
]

export const mockGames = [
  { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', ownerCount: 3, totalMembers: 3, isMultiplayer: true, isCoop: false, genres: [{ id: '1', description: 'Action' }, { id: '29', description: 'Massively Multiplayer' }], metacriticScore: 81, type: 'game', shortDescription: 'FPS compétitif', platforms: { windows: true, mac: false, linux: true }, recommendationsTotal: 1000000, releaseDate: '2023-09-27', comingSoon: false, controllerSupport: null, isFree: true, contentDescriptors: null },
  { steamAppId: 570, gameName: 'Dota 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg', ownerCount: 3, totalMembers: 3, isMultiplayer: true, isCoop: false, genres: [{ id: '2', description: 'Strategy' }, { id: '1', description: 'Action' }], metacriticScore: 90, type: 'game', shortDescription: 'MOBA', platforms: { windows: true, mac: true, linux: true }, recommendationsTotal: 2000000, releaseDate: '2013-07-09', comingSoon: false, controllerSupport: null, isFree: true, contentDescriptors: null },
  { steamAppId: 440, gameName: 'Team Fortress 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/440/header.jpg', ownerCount: 2, totalMembers: 3, isMultiplayer: true, isCoop: false, genres: [{ id: '1', description: 'Action' }], metacriticScore: 92, type: 'game', shortDescription: 'FPS', platforms: { windows: true, mac: true, linux: true }, recommendationsTotal: 800000, releaseDate: '2007-10-10', comingSoon: false, controllerSupport: 'full', isFree: true, contentDescriptors: null },
  { steamAppId: 1091500, gameName: 'Cyberpunk 2077', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/header.jpg', ownerCount: 3, totalMembers: 3, isMultiplayer: false, isCoop: false, genres: [{ id: '3', description: 'RPG' }, { id: '1', description: 'Action' }], metacriticScore: 76, type: 'game', shortDescription: 'RPG open world', platforms: { windows: true, mac: false, linux: false }, recommendationsTotal: 500000, releaseDate: '2020-12-10', comingSoon: false, controllerSupport: 'full', isFree: false, contentDescriptors: null },
  { steamAppId: 413150, gameName: 'Stardew Valley', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg', ownerCount: 3, totalMembers: 3, isMultiplayer: true, isCoop: true, genres: [{ id: '25', description: 'Adventure' }, { id: '3', description: 'RPG' }], metacriticScore: 89, type: 'game', shortDescription: 'Farming sim', platforms: { windows: true, mac: true, linux: true }, recommendationsTotal: 600000, releaseDate: '2016-02-26', comingSoon: false, controllerSupport: 'partial', isFree: false, contentDescriptors: null },
  { steamAppId: 99999, gameName: 'Some DLC Pack', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/99999/header.jpg', ownerCount: 3, totalMembers: 3, isMultiplayer: false, isCoop: false, genres: null, metacriticScore: null, type: 'dlc', shortDescription: null, platforms: { windows: true, mac: false, linux: false }, recommendationsTotal: null, releaseDate: null, comingSoon: false, controllerSupport: null, isFree: false, contentDescriptors: null },
]

export const mockVoteHistory = [
  { id: 'vs-1', winningGameAppId: 730, winningGameName: 'Counter-Strike 2', closedAt: '2025-03-01T20:00:00Z' },
  { id: 'vs-2', winningGameAppId: 570, winningGameName: 'Dota 2', closedAt: '2025-02-25T20:00:00Z' },
]

// Library games (Ma bibliothèque) — shape: LibraryGame
export const mockLibraryGames = [
  { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', playtimeForever: 12000, playtime2weeks: 300, shortDescription: 'FPS compétitif', metacriticScore: 81, isFree: true, controllerSupport: null },
  { steamAppId: 1091500, gameName: 'Cyberpunk 2077', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/header.jpg', playtimeForever: 4200, playtime2weeks: 0, shortDescription: 'RPG open world', metacriticScore: 76, isFree: false, controllerSupport: 'full' },
  { steamAppId: 413150, gameName: 'Stardew Valley', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg', playtimeForever: 9000, playtime2weeks: 120, shortDescription: 'Farming sim', metacriticScore: 89, isFree: false, controllerSupport: 'partial' },
]

// Public profile (UserProfilePage) — shape: PublicUserProfile
export const mockPublicProfile = {
  id: 'user-2',
  displayName: 'Alice',
  avatarUrl: 'https://avatars.steamstatic.com/p2.jpg',
  gameCount: 120,
  totalPlaytimeMinutes: 24000,
  commonGamesWithViewer: [
    { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', playtimeForever: 6000 },
    { steamAppId: 570, gameName: 'Dota 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg', playtimeForever: 3000 },
  ],
  topGames: [
    { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', playtimeForever: 6000 },
  ],
  lastSyncedAt: '2025-03-01T20:00:00Z',
  visibilityFullLibrary: true,
  visibilityLastPlayed: true,
}

// Compare result (ComparePage) — shape: UserCompareResult
export const mockCompareResult = {
  a: mockPublicProfile,
  b: { ...mockPublicProfile, id: 'user-3', displayName: 'Bob' },
  commonGames: [
    { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', playtimeA: 6000, playtimeB: 4000 },
  ],
  onlyAGames: [{ steamAppId: 1091500, gameName: 'Cyberpunk 2077', headerImageUrl: null, playtimeForever: 4200 }],
  onlyBGames: [{ steamAppId: 413150, gameName: 'Stardew Valley', headerImageUrl: null, playtimeForever: 9000 }],
  overlapRatio: 0.5,
}

// Invite preview (JoinPage) — shape: InvitePreview
export const mockInvitePreview = {
  isValid: true,
  groupName: 'Les Gamers',
  memberCount: 3,
  memberAvatars: ['https://avatars.steamstatic.com/p1.jpg', 'https://avatars.steamstatic.com/p2.jpg'],
  topGames: [
    { gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg' },
    { gameName: 'Dota 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg' },
  ],
  recentWinner: { gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg' },
}

// Subscription catalog (SubscriptionPage)
export const mockSubscriptionCatalog = {
  entries: [
    { cadence: 'monthly', priceId: 'price_monthly', unitAmount: 300, currency: 'eur', default: true },
    { cadence: 'yearly', priceId: 'price_yearly', unitAmount: 3000, currency: 'eur', default: false },
  ],
  annualAvailable: true,
}

// Public stats (LandingPage social-proof strip)
export const mockPublicStats = { users: 1280, groups: 340, votesClosed: 5600, votesClosed7d: 210, generatedAt: '2025-03-08T12:00:00Z' }

// ── API mocking helper ─────────────────────────────────────────────

export async function mockAllApiRoutes(page: Page) {
  // Auth
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) })
  )

  // Auth profile
  await page.route('**/api/auth/profile**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ...mockUser,
      profileUrl: 'https://steamcommunity.com/id/testplayer',
      createdAt: '2025-01-01',
      platforms: [{ id: 'steam', name: 'Steam', connected: true, gameCount: 200, lastSyncedAt: '2025-03-01' }],
      discord: { linked: false },
    }) })
  })

  // Auth logout
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )

  // Join group — must be before the catch-all groups route
  await page.route('**/api/groups/join', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'group-1', name: 'Les Gamers', alreadyMember: false }) })
  )

  // Catch-all for /api/groups/** — dispatch by URL path
  await page.route(/\/api\/groups(\/|$)/, (route) => {
    const url = route.request().url()
    const method = route.request().method()
    const path = new URL(url).pathname

    // POST /api/groups (create group)
    if (path === '/api/groups' && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'group-new', name: 'New Group', inviteToken: 'abc123xyz', inviteExpiresAt: '2025-04-01' }) })
    }

    // GET /api/groups (list groups)
    if (path === '/api/groups') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockGroups) })
    }

    // POST /api/groups/join
    if (path === '/api/groups/join') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'group-1', name: 'Les Gamers', alreadyMember: false }) })
    }

    // /api/groups/:id/common-games/preview
    if (path.includes('/common-games/preview')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gameCount: 42, totalMembers: 3 }) })
    }

    // /api/groups/:id/common-games
    if (path.includes('/common-games')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games: mockGames, totalMembers: 3, threshold: 1 }) })
    }

    // /api/groups/:id/vote/history
    if (path.includes('/vote/history')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockVoteHistory) })
    }

    // POST /api/groups/:id/vote/:sessionId/close
    if (path.includes('/close') && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        result: { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg', yesCount: 2, totalVoters: 3 },
      }) })
    }

    // GET /api/groups/:id/vote (get vote session). Default: NO active session,
    // so the group page shows the "Lancer un vote" CTA. Tests that need an open
    // ballot (the vote-page specs) register their own override, which takes
    // precedence over this catch-all.
    if (path.match(/\/vote$/) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        session: null,
        games: [],
        myVotes: [],
        voterCount: 0,
        totalMembers: 3,
        isParticipant: true,
        participantIds: ['user-1', 'user-2', 'user-3'],
      }) })
    }

    // POST /api/groups/:id/vote (create vote session)
    if (path.match(/\/vote$/) && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
        games: mockGames.filter(g => g.type === 'game').slice(0, 5),
      }) })
    }

    // POST /api/groups/:id/vote/:sessionId (cast vote)
    if (path.match(/\/vote\/[^/]+$/) && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }

    // POST /api/groups/:id/invite
    if (path.includes('/invite') && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inviteToken: 'invite-token-xyz', inviteExpiresAt: '2025-04-01' }) })
    }

    // POST /api/groups/:id/sync
    if (path.includes('/sync') && method === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }

    // DELETE /api/groups/:id/members/:userId
    if (path.includes('/members/') && method === 'DELETE') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }

    // DELETE /api/groups/:id (delete group)
    if (method === 'DELETE') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }

    // GET /api/groups/:id (group detail) — catch-all for group paths
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 'group-1', name: 'Les Gamers', createdBy: 'user-1', commonGameThreshold: null, createdAt: '2025-01-01',
      members: mockMembers,
    }) })
  })

  const json = (route: Parameters<Parameters<Page['route']>[1]>[0], body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  // Invite preview (public, mounted at /invite not /api) — JoinPage
  await page.route('**/invite/*/preview', (route) => json(route, mockInvitePreview))

  // Ma bibliothèque — GET /api/library (+ query string)
  await page.route(/\/api\/library(\?|$)/, (route) =>
    json(route, { games: mockLibraryGames, total: mockLibraryGames.length })
  )
  await page.route('**/api/library/promote-targets', (route) => json(route, { groups: mockGroups }))
  await page.route('**/api/library/promote', (route) => json(route, { ok: true, delivered: true }))

  // Subscription — current plan (defaults to free; premium-gated tests override)
  await page.route('**/api/subscription/me', (route) =>
    json(route, { tier: 'free', status: 'inactive', currentPeriodEnd: null, cancelAtPeriodEnd: false, source: 'none' })
  )
  // Subscription — SubscriptionPage
  await page.route('**/api/subscription/catalog', (route) => json(route, mockSubscriptionCatalog))
  await page.route('**/api/subscription/checkout', (route) => json(route, { url: 'https://checkout.stripe.com/mock' }))
  await page.route('**/api/subscription/portal', (route) => json(route, { url: 'https://billing.stripe.com/mock' }))

  // Public stats — LandingPage social-proof strip
  await page.route('**/api/stats/public', (route) => json(route, mockPublicStats))

  // Discord bot invite URL (ProfilePage / GroupPage)
  await page.route('**/api/discord/bot-invite-url', (route) => json(route, { enabled: false, url: null }))

  // Wishlist (ProfilePage / library)
  await page.route('**/api/auth/me/wishlist', (route) => json(route, { data: [] }))

  // Users: compare, public profile, visibility, streaks — must come before
  // narrower handlers are unnecessary since paths are distinct.
  await page.route(/\/api\/users\/compare/, (route) => json(route, mockCompareResult))
  await page.route('**/api/users/me/visibility', (route) => {
    if (route.request().method() === 'PATCH') {
      return json(route, { visibilityFullLibrary: true, visibilityLastPlayed: true })
    }
    return json(route, { visibilityFullLibrary: true, visibilityLastPlayed: true })
  })
  await page.route('**/api/users/me/streaks', (route) => json(route, { bestCurrent: 3, bestEver: 7, activeStreakGroups: 1 }))
  await page.route(/\/api\/users\/[^/]+\/profile/, (route) => json(route, mockPublicProfile))

  // Mock Socket.io — fulfill with valid open packet to prevent reconnect loops
  await page.route('**/socket.io/**', (route) => {
    const url = route.request().url()
    if (url.includes('transport=polling')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '0{"sid":"mock","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}',
      })
    }
    return route.abort()
  })
}

// ── Extended test fixture ──────────────────────────────────────────

export const test = base.extend<{ setupMocks: void }>({
  setupMocks: [async ({ page }, use) => {
    await mockAllApiRoutes(page)
    await use()
  }, { auto: true }],
})

/**
 * Register an OPEN vote session for `groupId` so the vote-page (ballot) UI
 * renders. Registered after the base mocks, so it takes precedence over the
 * "no active session" default in mockAllApiRoutes. Tests needing a more
 * specific session shape can register their own override afterwards.
 */
export async function mockOpenVoteSession(page: Page, groupId = 'group-1') {
  await page.route(`**/api/groups/${groupId}/vote`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: { id: 'session-1', groupId, status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
        games: mockGames.filter((g) => g.type === 'game').slice(0, 5),
        myVotes: [],
        voterCount: 0,
        totalMembers: 3,
        isParticipant: true,
        participantIds: ['user-1', 'user-2', 'user-3'],
      }),
    })
  })
}

export { expect } from '@playwright/test'
export type { Page } from '@playwright/test'
