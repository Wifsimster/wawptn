import { test, expect, mockGames, mockUser } from './fixtures'

test.describe('Voting system on mobile', () => {
  // ── Vote page: game selection ─────────────────────────────────

  test.describe('Game selection interface', () => {
    test('shows all votable games in 2-column grid', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      await expect(page.getByText('Choisis tes jeux')).toBeVisible()

      // Grid should have 2 columns on mobile
      const grid = page.locator('.grid.grid-cols-2')
      await expect(grid).toBeVisible()

      // Games should be displayed (only type=game, first 5)
      const gameButtons = page.locator('.grid button')
      const count = await gameButtons.count()
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThanOrEqual(5)
    })

    test('tapping a game selects it with visual feedback', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const firstGame = page.locator('.grid button').first()

      // Initially not selected — should have border-border class
      await expect(firstGame).not.toHaveClass(/border-primary/)

      // Tap to select
      await firstGame.click()

      // Should now have primary border and check icon
      await expect(firstGame).toHaveClass(/border-primary/)
      const checkIcon = firstGame.locator('.bg-primary.rounded-full')
      await expect(checkIcon).toBeVisible()

      // Selection count should update
      await expect(page.getByText('1 jeu(x) sélectionné(s)')).toBeVisible()
    })

    test('tapping a selected game deselects it', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const firstGame = page.locator('.grid button').first()
      await firstGame.click()
      await expect(page.getByText('1 jeu(x) sélectionné(s)')).toBeVisible()

      // Tap again to deselect
      await firstGame.click()
      await expect(page.getByText('0 jeu(x) sélectionné(s)')).toBeVisible()
      await expect(firstGame).not.toHaveClass(/border-primary/)
    })

    test('selecting multiple games updates counter', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const games = page.locator('.grid button')
      const count = await games.count()

      // Select first 3 games
      for (let i = 0; i < Math.min(3, count); i++) {
        await games.nth(i).click()
      }

      await expect(page.getByText(`${Math.min(3, count)} jeu(x) sélectionné(s)`)).toBeVisible()
    })
  })

  // ── Vote page: search ─────────────────────────────────────────

  test.describe('Vote page search', () => {
    test('filters games by name in vote view', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const searchInput = page.getByPlaceholder('Rechercher un jeu...')
      await searchInput.fill('Counter')

      const visibleGames = page.locator('.grid button')
      const count = await visibleGames.count()
      expect(count).toBe(1)
    })

    test('search preserves selection state', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      // Select a game
      await page.locator('.grid button').first().click()
      await expect(page.getByText('1 jeu(x) sélectionné(s)')).toBeVisible()

      // Search
      await page.getByPlaceholder('Rechercher un jeu...').fill('xyz')
      // Clear search
      await page.getByPlaceholder('Rechercher un jeu...').fill('')

      // Selection should persist
      await expect(page.getByText('1 jeu(x) sélectionné(s)')).toBeVisible()
    })
  })

  // ── Vote submission ───────────────────────────────────────────

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

      await page.locator('.grid button').first().click()

      const submitBtn = page.getByRole('button', { name: 'Valider ma sélection' })
      await expect(submitBtn).toBeEnabled()
    })

    test('submitting votes shows waiting screen', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      // Select 2 games
      await page.locator('.grid button').nth(0).click()
      await page.locator('.grid button').nth(1).click()

      // Submit
      await page.getByRole('button', { name: 'Valider ma sélection' }).click()

      // Should show waiting screen
      await expect(page.getByText('Vote soumis !')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('2 jeu(x) sélectionné(s)')).toBeVisible()
    })

    test('floating action bar sticks to bottom of viewport', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const actionBar = page.locator('.fixed.bottom-0')
      await expect(actionBar).toBeVisible()

      // Verify it's at the bottom
      const box = await actionBar.boundingBox()
      const viewport = page.viewportSize()
      expect(box).not.toBeNull()
      if (box && viewport) {
        expect(box.y + box.height).toBeCloseTo(viewport.height, -1)
      }
    })
  })

  // ── Waiting screen ────────────────────────────────────────────

  test.describe('Waiting screen', () => {
    test('shows progress after voting', async ({ page }) => {
      // Mock vote session where user has already voted
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

      // Should show waiting screen since user already voted
      await expect(page.getByText('Vote soumis !')).toBeVisible()
      await expect(page.getByText('2 jeu(x) sélectionné(s)')).toBeVisible()
      await expect(page.getByText(/1 sur 3 ont voté/)).toBeVisible()

      // Progress bar should be visible
      const progress = page.locator('[role="progressbar"]')
      await expect(progress).toBeVisible()
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

  // ── Closing vote and result screen ────────────────────────────

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

      // Close the vote
      await page.getByText('Clôturer le vote').click()

      // Result screen
      await expect(page.getByText('Ce soir vous jouez à')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Counter-Strike 2')).toBeVisible()
      // Consensus block: ratio label is rendered immediately (the percent
      // number animates via a count-up so we avoid asserting on it).
      await expect(page.getByText('2/3', { exact: true })).toBeVisible()
      await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '67')

      // Steam launch button
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

  // ── Non-participant view ──────────────────────────────────────

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

  // ── Scheduled vote with countdown ─────────────────────────────

  test.describe('Scheduled vote', () => {
    test('shows countdown timer for scheduled session', async ({ page }) => {
      const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() // 3 hours from now

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

      // Should show waiting screen with countdown
      await expect(page.getByText('Vote soumis !')).toBeVisible()
      await expect(page.getByText('La soirée commence dans...')).toBeVisible()
    })
  })

  // ── Full voting flow E2E ──────────────────────────────────────

  test.describe('Full voting flow', () => {
    test('complete flow: start vote -> select games -> submit -> close -> result', async ({ page }) => {
      // Step 1: Start from group page
      await page.goto('/groups/group-1')
      await expect(page.getByText('Lancer un vote')).toBeVisible({ timeout: 15000 })

      // Step 2: Open vote setup
      await page.getByText('Lancer un vote').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400) // Wait for drawer animation

      // Step 3: Keep all members selected, proceed
      const suivantBtn = dialog.getByRole('button', { name: 'Suivant' })
      await suivantBtn.scrollIntoViewIfNeeded()
      await suivantBtn.click({ force: true })
      await expect(dialog.getByText('Lancer le vote ?')).toBeVisible()

      // Step 4: Start the vote
      await dialog.getByRole('button', { name: 'Lancer le vote' }).click({ force: true })
      await page.waitForURL('**/groups/group-1/vote')

      // Step 5: Select some games
      await expect(page.getByText('Choisis tes jeux')).toBeVisible()
      const gameButtons = page.locator('.grid button')
      await gameButtons.nth(0).click()
      await gameButtons.nth(1).click()
      await expect(page.getByText('2 jeu(x) sélectionné(s)')).toBeVisible()

      // Step 6: Submit vote
      await page.getByRole('button', { name: 'Valider ma sélection' }).click()

      // Step 7: Waiting screen
      await expect(page.getByText('Vote soumis !')).toBeVisible({ timeout: 5000 })

      // Step 8: Close vote (as creator)
      await page.getByText('Clôturer le vote').click()

      // Step 9: Result screen
      await expect(page.getByText('Ce soir vous jouez à')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Lancer sur Steam')).toBeVisible()

      // Step 10: Back to group
      await page.getByText('Retour au groupe').click()
      await page.waitForURL('**/groups/group-1')
    })
  })

  // ── Mobile-specific touch interactions ────────────────────────

  test.describe('Mobile touch interactions', () => {
    test('game cards have touch-friendly tap targets', async ({ page }) => {
      await page.goto('/groups/group-1/vote')
      await page.waitForTimeout(500)

      const firstGame = page.locator('.grid button').first()
      const box = await firstGame.boundingBox()

      expect(box).not.toBeNull()
      if (box) {
        // Minimum 44px tap target (WCAG recommendation)
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

      // Content should be scrollable
      const main = page.locator('main')
      await expect(main).toBeVisible()

      // Perform a scroll gesture (use evaluate for cross-browser support)
      await page.evaluate(() => window.scrollBy(0, 300))
      await page.waitForTimeout(200)
    })
  })
})
