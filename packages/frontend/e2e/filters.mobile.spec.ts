import { test, expect, type Page } from './fixtures'

const gameGrid = (page: Page) =>
  page.locator('.space-y-3').filter({ has: page.locator('search') })

const openDrawer = async (page: Page) => {
  await gameGrid(page).locator('button[aria-haspopup="dialog"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test.describe('Game list filters on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/groups/group-1')
    await expect(page.getByPlaceholder('Rechercher un jeu...')).toBeVisible({ timeout: 15000 })
  })

  test.describe('Text search', () => {
    test('filters games by name', async ({ page }) => {
      await page.getByPlaceholder('Rechercher un jeu...').fill('Counter')
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
      await expect(gameGrid(page).getByText('Dota 2')).not.toBeVisible()
    })

    test('search is case-insensitive', async ({ page }) => {
      await page.getByPlaceholder('Rechercher un jeu...').fill('counter-strike')
      await expect(gameGrid(page).getByText('Counter-Strike 2')).toBeVisible()
    })

    test('clear search button resets results', async ({ page }) => {
      const search = page.getByPlaceholder('Rechercher un jeu...')
      await search.fill('Counter')
      await expect(gameGrid(page).getByText('Dota 2')).not.toBeVisible()

      await page.getByRole('button', { name: 'Effacer la recherche' }).click()
      await expect(search).toHaveValue('')
      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
    })

    test('shows a no-results message when nothing matches', async ({ page }) => {
      await page.getByPlaceholder('Rechercher un jeu...').fill('zzz-no-such-game')
      await expect(page.getByText('Aucun jeu ne correspond à tes filtres.')).toBeVisible()
    })
  })

  test.describe('Mode toggles', () => {
    test('multiplayer toggle reflects its pressed state', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'Multijoueur' })
      const initial = await btn.getAttribute('aria-pressed')
      await btn.click()
      await expect(btn).toHaveAttribute('aria-pressed', initial === 'true' ? 'false' : 'true')
    })

    test('coop toggle reflects its pressed state', async ({ page }) => {
      const btn = page.getByRole('button', { name: 'Coopératif' })
      const initial = await btn.getAttribute('aria-pressed')
      await btn.click()
      await expect(btn).toHaveAttribute('aria-pressed', initial === 'true' ? 'false' : 'true')
    })
  })

  test.describe('Preset chips', () => {
    test('applying a preset marks it active', async ({ page }) => {
      const preset = page.getByRole('button', { name: 'Top notés' })
      await preset.click()
      await expect(preset).toHaveAttribute('aria-pressed', 'true')
    })
  })

  test.describe('Advanced filters drawer', () => {
    test('opens and shows the advanced sections', async ({ page }) => {
      await openDrawer(page)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Metacritic')).toBeVisible()
      await expect(dialog.getByText('Trier par')).toBeVisible()
      await expect(dialog.getByText('Genres')).toBeVisible()
    })

    test('a Metacritic 90+ threshold filters out lower-scored games', async ({ page }) => {
      await openDrawer(page)
      await page.getByRole('dialog').getByRole('button', { name: '90+' }).click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).not.toBeVisible()

      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
      await expect(gameGrid(page).getByText('Counter-Strike 2')).not.toBeVisible()
    })

    test('a chosen sort is reflected as a pressed option', async ({ page }) => {
      await openDrawer(page)
      const sortName = page.getByRole('dialog').getByRole('button', { name: 'Nom' })
      await sortName.click()
      await expect(sortName).toHaveAttribute('aria-pressed', 'true')
    })

    test('selecting a genre narrows the grid', async ({ page }) => {
      await openDrawer(page)
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: /Genres/ }).click()
      await dialog.getByRole('button', { name: 'Strategy' }).click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).not.toBeVisible()

      await expect(gameGrid(page).getByText('Dota 2')).toBeVisible()
      await expect(gameGrid(page).getByText('Cyberpunk 2077')).not.toBeVisible()
    })
  })

  test.describe('Display', () => {
    test('game grid uses a 2-column layout on mobile', async ({ page }) => {
      await expect(page.locator('.grid.grid-cols-2').first()).toBeVisible()
    })
  })
})
