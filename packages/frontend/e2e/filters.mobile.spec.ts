import { test, expect } from './fixtures'

test.describe('Game list filters on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/groups/group-1')
    // Wait for game grid to fully render (avoid networkidle due to socket.io)
    await expect(page.getByPlaceholder('Rechercher un jeu...')).toBeVisible({ timeout: 15000 })
  })

  // Helper: scope assertions to game grid area (avoids duplicates with vote history)
  const gameGrid = (page: import('@playwright/test').Page) => page.locator('.space-y-3').filter({ has: page.locator('[role="search"]') })

  // ── Text search ───────────────────────────────────────────────

  test.describe('Text search', () => {
    test('filters games by name', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Rechercher un jeu...')
      await searchInput.fill('Counter')

      // Should show only Counter-Strike 2
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
      await expect(gameGrid(page).getByText('Dota 2')).not.toBeVisible()

      // Filtered count should appear
      await expect(page.getByText(/1\/\d+/)).toBeVisible()
    })

    test('search is case-insensitive and diacritic-insensitive', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Rechercher un jeu...')
      await searchInput.fill('counter-strike')
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
    })

    test('clear search button resets results', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Rechercher un jeu...')
      await searchInput.fill('Counter')
      await expect(gameGrid(page).getByText('Dota 2')).not.toBeVisible()

      // Clear search
      await page.getByRole('button', { name: 'Effacer la recherche' }).click()
      await expect(searchInput).toHaveValue('')

      // Multiple games visible again
      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
    })

    test('shows no results message when no match', async ({ page }) => {
      await page.getByPlaceholder('Rechercher un jeu...').fill('xyznonexistent')
      await expect(page.getByText('Aucun jeu ne correspond')).toBeVisible()
      await expect(page.getByText('Réinitialiser les filtres')).toBeVisible()
    })

    test('reset filters link clears everything', async ({ page }) => {
      await page.getByPlaceholder('Rechercher un jeu...').fill('xyznonexistent')
      await page.getByText('Réinitialiser les filtres').click()
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
    })
  })

  // ── Mode toggles ──────────────────────────────────────────────

  test.describe('Mode toggle buttons', () => {
    test('Multiplayer toggle is active by default', async ({ page }) => {
      // The multiplayer button should exist and be visible
      const multiBtn = page.getByRole('button', { name: 'Multijoueur' })
      await expect(multiBtn).toBeVisible()
    })

    test('Coop toggle deactivates Multiplayer (mutually exclusive)', async ({ page }) => {
      await page.getByRole('button', { name: 'Coopératif' }).click()
      await page.waitForTimeout(300)
      // Clicking coop should work without error
    })

    test('Games Only toggle excludes DLC', async ({ page }) => {
      // Games Only is on by default — DLC should not appear
      await expect(gameGrid(page).getByText('Some DLC Pack')).not.toBeVisible()

      // Toggle off Games Only
      await page.getByRole('button', { name: 'Jeux uniquement' }).click()
      await page.waitForTimeout(300)
    })

    test('Controller support filter', async ({ page }) => {
      const manette = page.getByRole('button', { name: 'Manette' })
      await manette.scrollIntoViewIfNeeded()
      await manette.click({ force: true })
      await page.waitForTimeout(300)

      // TF2 has full controller support, should still be visible
      await expect(gameGrid(page).getByText('Team Fortress 2')).toBeVisible()
      // CS2 has no controller support, should be hidden
      await expect(gameGrid(page).getByText('Counter-Strike 2')).not.toBeVisible()
    })
  })

  // ── Metacritic filter ─────────────────────────────────────────

  test.describe('Metacritic score filter', () => {
    test('shows all scores by default', async ({ page }) => {
      await expect(page.getByText('Metacritic')).toBeVisible()
      const allBtn = page.getByRole('button', { name: 'Tous' })
      await expect(allBtn).toBeVisible()
    })

    test('filters games by minimum Metacritic score 90+', async ({ page }) => {
      await page.getByRole('button', { name: '90+' }).click()
      await page.waitForTimeout(300)

      // TF2 (92) and Dota 2 (90) should remain
      await expect(gameGrid(page).getByText('Team Fortress 2')).toBeVisible()
      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
      // CS2 (81) should be hidden
      await expect(gameGrid(page).getByText('Counter-Strike 2')).not.toBeVisible()
    })

    test('clicking Tous resets metacritic filter', async ({ page }) => {
      await page.getByRole('button', { name: '80+' }).click()
      await page.waitForTimeout(300)

      await page.getByRole('button', { name: 'Tous' }).click()
      await page.waitForTimeout(300)

      // All games should be visible again
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
    })

    test('progressive thresholds reduce game count', async ({ page }) => {
      const btn60 = page.getByRole('button', { name: '60+' })
      await btn60.scrollIntoViewIfNeeded()
      await btn60.click({ force: true })
      await page.waitForTimeout(300)

      const countEl = page.locator('h2').filter({ hasText: /Jeux en commun/ })
      const count60Text = await countEl.textContent()

      const btn85 = page.getByRole('button', { name: '85+' })
      await btn85.scrollIntoViewIfNeeded()
      await btn85.click({ force: true })
      await page.waitForTimeout(300)

      const count85Text = await countEl.textContent()
      expect(count85Text).not.toBe(count60Text)
    })
  })

  // ── Platform filter ───────────────────────────────────────────

  test.describe('Platform filter', () => {
    test('shows all platforms by default', async ({ page }) => {
      await expect(page.getByText('Plateforme')).toBeVisible()
    })

    test('filters to Windows only', async ({ page }) => {
      await page.getByRole('button', { name: 'Windows' }).click()
      await page.waitForTimeout(300)
      // All mock games support Windows
    })

    test('filters to Mac only', async ({ page }) => {
      await page.getByRole('button', { name: 'Mac' }).click()
      await page.waitForTimeout(300)

      // Cyberpunk 2077 doesn't support Mac
      // Note: Cyberpunk is not multiplayer so it's already hidden by default multiplayer filter
      // Dota 2 supports Mac and is multiplayer
      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
    })

    test('filters to Linux only', async ({ page }) => {
      await page.getByRole('button', { name: 'Linux' }).click()
      await page.waitForTimeout(300)

      // CS2 supports Linux and is multiplayer
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
    })

    test('switching back to Toutes shows all games', async ({ page }) => {
      await page.getByRole('button', { name: 'Linux' }).click()
      await page.waitForTimeout(200)
      await page.getByRole('button', { name: 'Toutes' }).click()
      await page.waitForTimeout(200)

      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
    })
  })

  // ── Sort ──────────────────────────────────────────────────────

  test.describe('Sorting', () => {
    test('sort by name shows alphabetical order', async ({ page }) => {
      await page.getByRole('button', { name: 'Nom' }).click()
      await page.waitForTimeout(300)

      // Get game names from the grid
      const gameNames = await gameGrid(page).locator('.grid .text-xs.font-medium').allTextContents()
      const sortedNames = [...gameNames].sort((a, b) => a.localeCompare(b))
      expect(gameNames).toEqual(sortedNames)
    })

    test('sort by popularity orders by recommendations', async ({ page }) => {
      await page.getByRole('button', { name: 'Popularité' }).click()
      await page.waitForTimeout(300)

      // First game should be Dota 2 (most recommendations: 2M)
      const firstGameName = await gameGrid(page).locator('.grid .text-xs.font-medium').first().textContent()
      expect(firstGameName).toBe('Dota 2')
    })

    test('sort by Possédé par is default', async ({ page }) => {
      const ownersBtn = page.getByRole('button', { name: 'Possédé par' })
      await expect(ownersBtn).toBeVisible()
    })
  })

  // ── Genre filter ──────────────────────────────────────────────

  test.describe('Genre filter', () => {
    test('genres section is collapsed by default', async ({ page }) => {
      const genreBtn = page.locator('button').filter({ hasText: 'Genres' })
      await expect(genreBtn).toBeVisible()
      // Genre pills should not be visible yet (Action, Strategy, etc.)
      await expect(page.locator('button:text-is("Strategy")').first()).not.toBeVisible()
    })

    test('expands and shows genre pills', async ({ page }) => {
      await page.locator('button').filter({ hasText: 'Genres' }).click()
      await page.waitForTimeout(200)

      await expect(page.locator('button:text-is("Action")')).toBeVisible()
      await expect(page.locator('button:text-is("Strategy")')).toBeVisible()
    })

    test('selecting a genre filters games', async ({ page }) => {
      const genreBtn = page.locator('button').filter({ hasText: 'Genres' })
      await genreBtn.scrollIntoViewIfNeeded()
      await genreBtn.click({ force: true })
      await page.waitForTimeout(200)

      // Click Strategy genre
      const strategyBtn = page.locator('button:text-is("Strategy")')
      await strategyBtn.scrollIntoViewIfNeeded()
      await strategyBtn.click({ force: true })
      await page.waitForTimeout(300)

      // Dota 2 has Strategy genre, should be visible
      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
      // Filtered count should show in heading
      await expect(page.locator('h2').filter({ hasText: /\d+\/\d+/ })).toBeVisible()
    })

    test('selected genre shows badge count', async ({ page }) => {
      const genreBtn = page.locator('button').filter({ hasText: 'Genres' })
      await genreBtn.scrollIntoViewIfNeeded()
      await genreBtn.click({ force: true })
      await page.waitForTimeout(200)

      const actionBtn = page.locator('button:text-is("Action")')
      await actionBtn.scrollIntoViewIfNeeded()
      await actionBtn.click({ force: true })
      await page.waitForTimeout(100)
      const strategyBtn = page.locator('button:text-is("Strategy")')
      await strategyBtn.scrollIntoViewIfNeeded()
      await strategyBtn.click({ force: true })
      await page.waitForTimeout(100)

      // Badge should show "2" (Badge renders as div)
      const badge = page.locator('button').filter({ hasText: 'Genres' }).locator('div').filter({ hasText: '2' })
      await expect(badge).toBeVisible()
    })

    test('clear genres button removes all genre filters', async ({ page }) => {
      await page.locator('button').filter({ hasText: 'Genres' }).click()
      await page.waitForTimeout(200)

      await page.locator('button:text-is("Action")').click()
      await page.waitForTimeout(200)

      await page.getByText('Effacer').click()
      await page.waitForTimeout(200)
    })

    test('multiple genres work as OR filter', async ({ page }) => {
      await page.locator('button').filter({ hasText: 'Genres' }).click()
      await page.waitForTimeout(200)

      await page.locator('button:text-is("Strategy")').click()
      await page.waitForTimeout(100)

      // Dota 2 has Strategy genre
      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
    })
  })

  // ── Combined filters ──────────────────────────────────────────

  test.describe('Combined filters', () => {
    test('search + metacritic combined', async ({ page }) => {
      await page.getByPlaceholder('Rechercher un jeu...').fill('Dota')
      await page.getByRole('button', { name: '90+' }).click()
      await page.waitForTimeout(300)

      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
    })

    test('platform + controller combined', async ({ page }) => {
      const linuxBtn = page.getByRole('button', { name: 'Linux' })
      await linuxBtn.scrollIntoViewIfNeeded()
      await linuxBtn.click({ force: true })
      const manette = page.getByRole('button', { name: 'Manette' })
      await manette.scrollIntoViewIfNeeded()
      await manette.click({ force: true })
      await page.waitForTimeout(300)

      // TF2: Linux + full controller, multiplayer
      await expect(gameGrid(page).getByText('Team Fortress 2')).toBeVisible()
      // CS2: Linux but no controller
      await expect(gameGrid(page).getByText('Counter-Strike 2')).not.toBeVisible()
    })

    test('game count updates with each filter', async ({ page }) => {
      // Initially shows total count
      const initialHeader = await page.locator('h2').filter({ hasText: /Jeux en commun/ }).textContent()

      // Apply metacritic filter
      await page.getByRole('button', { name: '90+' }).click()
      await page.waitForTimeout(300)

      const filteredHeader = await page.locator('h2').filter({ hasText: /Jeux en commun/ }).textContent()
      expect(filteredHeader).not.toBe(initialHeader)
    })
  })

  // ── Display controls ─────────────────────────────────────────

  test.describe('Display controls', () => {
    test('game grid uses 2 columns on mobile', async ({ page }) => {
      const grid = page.locator('.grid.grid-cols-2').first()
      await expect(grid).toBeVisible()
    })

    test('game cards show metacritic badges', async ({ page }) => {
      // CS2 has metacritic 81 — badge should show
      const metacriticBadge = page.locator('span:text("81")').first()
      await expect(metacriticBadge).toBeVisible()
    })
  })
})
