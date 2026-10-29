import { test, expect, mockGames, mockOpenVoteSession } from './fixtures'

test.describe('Voting system on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenVoteSession(page, 'group-1')
  })

  test.describe('Game selection interface', () => {
    test('shows all votable games in 2-column grid', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Choisis tes jeux')).toBeVisible()

      const grid = page.locator('.grid.grid-cols-2')
      await expect(grid).toBeVisible()

      const gameButtons = page.locator('.grid button[aria-pressed]')
      const count = await gameButtons.count()
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThanOrEqual(5)
    })

    test('tapping a game selects it with visual feedback', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const firstGame = page.locator('.grid button[aria-pressed]').first()

      await expect(firstGame).toHaveAttribute('aria-pressed', 'false')

      await firstGame.click()

      await expect(firstGame).toHaveAttribute('aria-pressed', 'true')
      const card = page.locator('.grid > div').first()
      await expect(card).toHaveClass(/border-primary/)
      await expect(card.locator('.bg-primary.rounded-full')).toBeVisible()

      await expect(page.getByText('1 jeu(x) sélectionné(s)').first()).toBeVisible()
    })

    test('tapping a selected game deselects it', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const firstGame = page.locator('.grid button[aria-pressed]').first()
      await firstGame.click()
      await expect(page.getByText('1 jeu(x) sélectionné(s)').first()).toBeVisible()

      await firstGame.click()
      await expect(page.getByText('0 jeu(x) sélectionné(s)').first()).toBeVisible()
      await expect(firstGame).toHaveAttribute('aria-pressed', 'false')
    })

    test('selecting multiple games updates counter', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const games = page.locator('.grid button[aria-pressed]')
      const count = await games.count()

      for (let i = 0; i < Math.min(3, count); i++) {
        await games.nth(i).click()
      }

      await expect(page.getByText(`${Math.min(3, count)} jeu(x) sélectionné(s)`).first()).toBeVisible()
    })
  })

  test.describe('Vote page search', () => {
    test('filters games by name in vote view', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const searchInput = page.getByPlaceholder('Rechercher un jeu...')
      await searchInput.fill('Counter')

      const visibleGames = page.locator('.grid button[aria-pressed]')
      const count = await visibleGames.count()
      expect(count).toBe(1)
    })

    test('search preserves selection state', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await page.locator('.grid button[aria-pressed]').first().click()
      await expect(page.getByText('1 jeu(x) sélectionné(s)').first()).toBeVisible()

      await page.getByPlaceholder('Rechercher un jeu...').fill('xyz')
      await page.getByPlaceholder('Rechercher un jeu...').fill('')

      await expect(page.getByText('1 jeu(x) sélectionné(s)').first()).toBeVisible()
    })
  })

  test.describe('Vote submission', () => {
    test('submit button is disabled when no games selected', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const submitBtn = page.getByRole('button', { name: 'Valider ma sélection' })
      await expect(submitBtn).toBeDisabled()
    })

    test('submit button is enabled when games are selected', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await page.locator('.grid button[aria-pressed]').first().click()

      const submitBtn = page.getByRole('button', { name: 'Valider ma sélection' })
      await expect(submitBtn).toBeEnabled()
    })

    test('submitting votes shows waiting screen', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await page.locator('.grid button[aria-pressed]').nth(0).click()
      await page.locator('.grid button[aria-pressed]').nth(1).click()

      await page.getByRole('button', { name: 'Valider ma sélection' }).click()

      await expect(page.getByText('Vote soumis !')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('2 jeu(x) sélectionné(s)').first()).toBeVisible()
    })

    test('floating action bar sticks to bottom of viewport', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const actionBar = page.locator('.fixed.bottom-0')
      await expect(actionBar).toBeVisible()

      const box = await actionBar.boundingBox()
      const viewport = page.viewportSize()
      expect(box).not.toBeNull()
      if (box && viewport) {
        expect(box.y + box.height).toBeCloseTo(viewport.height, -1)
      }
    })
  })

  test.describe('Waiting screen', () => {
    test('shows progress after voting', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [
              { steamAppId: 730, vote: true },
              { steamAppId: 570, vote: true },
              { steamAppId: 440, vote: false },
            ],
            voterCount: 1,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Vote soumis !')).toBeVisible()
      await expect(page.getByText('2 jeu(x) sélectionné(s)').first()).toBeVisible()
      await expect(page.getByText(/1 sur 3 ont voté/)).toBeVisible()

      await expect(page.getByRole('progressbar').first()).toBeVisible()
    })

    test('shows close vote button for session creator', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 2,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Clôturer le vote')).toBeVisible()
    })

    test('hides close vote button for non-creator', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-other', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 1,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Clôturer le vote')).not.toBeVisible()
    })

    test('back to group button navigates correctly', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 1,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await page.getByText('Retour au groupe').click()
      await page.waitForURL('**/groups/group-1')
    })
  })

  test.describe('Vote result screen', () => {
    test('closing vote shows winning game', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 3,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await page.getByText('Clôturer le vote').click()

      await expect(page.getByText('Ce soir vous jouez à')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Counter-Strike 2')).toBeVisible()
      await expect(page.getByText('2/3', { exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar')).toHaveAttribute('value', '67')

      await expect(page.getByText('Lancer sur Steam')).toBeVisible()
    })

    test('result screen has correct Steam launch link', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 3,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)
      await page.getByText('Clôturer le vote').click()

      const launchLink = page.getByRole('link', { name: 'Lancer sur Steam' })
      await expect(launchLink).toHaveAttribute('href', 'steam://run/730')
    })

    test('back to group from result screen', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 3,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)
      await page.getByText('Clôturer le vote').click()

      await expect(page.getByText('Counter-Strike 2')).toBeVisible({ timeout: 5000 })
      await page.getByText('Retour au groupe').click()
      await page.waitForURL('**/groups/group-1')
    })
  })

  test.describe('Non-participant view', () => {
    test('shows read-only message for non-participants', async ({ page }) => {
      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-other', scheduledAt: null, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [],
            voterCount: 0,
            totalMembers: 2,
            isParticipant: false,
            participantIds: ['user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Vote en cours')).toBeVisible()
      await expect(page.getByText('Tu ne participes pas')).toBeVisible()
    })
  })

  test.describe('Scheduled vote', () => {
    test('shows countdown timer for scheduled session', async ({ page }) => {
      const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

      await page.route('**/api/groups/group-1/vote', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: futureDate, createdAt: '2025-03-08' },
            games: mockGames.filter(g => g.type === 'game').slice(0, 5),
            myVotes: [{ steamAppId: 730, vote: true }],
            voterCount: 1,
            totalMembers: 3,
            isParticipant: true,
            participantIds: ['user-1', 'user-2', 'user-3'],
          }) })
        }
        return route.continue()
      })

      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Vote soumis !')).toBeVisible()
      await expect(page.getByText('La soirée commence dans...')).toBeVisible()
    })
  })

  test.describe('Full voting flow', () => {
    test('complete flow: start vote -> select games -> submit -> close -> result', async ({ page }) => {
      let voteCreated = false
      await page.route('**/api/groups/group-1/vote', (route) => {
        const method = route.request().method()
        const openBody = {
          session: { id: 'session-1', groupId: 'group-1', status: 'open', createdBy: 'user-1', scheduledAt: null, createdAt: '2025-03-08' },
          games: mockGames.filter((g) => g.type === 'game').slice(0, 5),
          myVotes: [], voterCount: 0, totalMembers: 3, isParticipant: true, participantIds: ['user-1', 'user-2', 'user-3'],
        }
        if (method === 'POST') {
          voteCreated = true
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(openBody) })
        }
        if (method === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(voteCreated ? openBody : { session: null, games: [], myVotes: [], voterCount: 0, totalMembers: 3, isParticipant: true, participantIds: ['user-1', 'user-2', 'user-3'] }) })
        }
        return route.fallback()
      })

      await page.goto('/groups/group-1')
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      const lancerBtn = dialog.getByRole('button', { name: 'Lancer le vote' })
      await lancerBtn.scrollIntoViewIfNeeded()
      await lancerBtn.click({ force: true })
      await page.waitForURL('**/groups/group-1/vote')

      await expect(page.getByText('Choisis tes jeux')).toBeVisible()
      const gameButtons = page.locator('.grid button[aria-pressed]')
      await gameButtons.nth(0).click()
      await gameButtons.nth(1).click()
      await expect(page.getByText('2 jeu(x) sélectionné(s)').first()).toBeVisible()

      await page.getByRole('button', { name: 'Valider ma sélection' }).click()

      await expect(page.getByText('Vote soumis !')).toBeVisible({ timeout: 5000 })

      await page.getByText('Clôturer le vote').click()

      await expect(page.getByText('Ce soir vous jouez à')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Lancer sur Steam')).toBeVisible()

      await page.getByText('Retour au groupe').click()
      await page.waitForURL('**/groups/group-1')
    })
  })

  test.describe('Mobile touch interactions', () => {
    test('game cards have touch-friendly tap targets', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const firstGame = page.locator('.grid button[aria-pressed]').first()
      const box = await firstGame.boundingBox()

      expect(box).not.toBeNull()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
    })

    test('back button navigates to group page', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await page.getByRole('button', { name: 'Retour' }).click()
      await page.waitForURL('**/groups/group-1')
    })

    test('scrolling the game list works properly', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const main = page.locator('main')
      await expect(main).toBeVisible()

      await page.evaluate(() => window.scrollBy(0, 300))
      await page.waitForTimeout(200)
    })
  })
})
