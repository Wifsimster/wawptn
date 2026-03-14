import { test, expect, mockGames } from './fixtures'

test.describe('Modals on mobile', () => {
  // ── Groups page modals ────────────────────────────────────────

  test.describe('Create Group modal', () => {
    test('opens as drawer, accepts input, and submits', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Créer' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Créer un groupe')).toBeVisible()
      await expect(dialog.getByText('Donne un nom à ton groupe')).toBeVisible()

      const input = dialog.getByPlaceholder('Nom du groupe...')
      await input.fill('Mon Nouveau Groupe')
      await dialog.getByRole('button', { name: 'Créer' }).click()

      await expect(dialog.getByText('Partage ce lien')).toBeVisible()
    })

    test('shows validation error when name is empty', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Créer' }).click()

      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Créer' }).click()

      await expect(dialog.getByRole('alert')).toBeVisible()
      await expect(dialog.getByText('Veuillez entrer un nom de groupe')).toBeVisible()
    })

    test('submits with Enter key', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Créer' }).click()

      const dialog = page.getByRole('dialog')
      await dialog.getByPlaceholder('Nom du groupe...').fill('Test Enter')
      await dialog.getByPlaceholder('Nom du groupe...').press('Enter')

      await expect(dialog.getByText('Partage ce lien')).toBeVisible()
    })

    test('closes with Escape', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Créer' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
    })
  })

  test.describe('Join Group modal', () => {
    test('opens as drawer, accepts token, and submits', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Rejoindre' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Rejoindre un groupe')).toBeVisible()

      await dialog.getByPlaceholder("Token d'invitation...").fill('valid-token')
      await dialog.getByRole('button', { name: 'Rejoindre' }).click()

      await page.waitForURL('**/groups/group-1')
    })

    test('shows validation error with empty token', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Rejoindre' }).click()

      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Rejoindre' }).click()

      await expect(dialog.getByRole('alert')).toBeVisible()
    })
  })

  // ── Logout confirmation modal ─────────────────────────────────

  test.describe('Logout confirmation modal', () => {
    test('opens from user menu and confirms logout', async ({ page }) => {
      await page.goto('/')
      await page.waitForTimeout(500)

      await page.getByRole('button', { name: 'Mon Profil' }).click()
      // The dropdown menu Se déconnecter
      await page.locator('.absolute.right-0').getByText('Se déconnecter').click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Se déconnecter ?')).toBeVisible()

      await dialog.getByRole('button', { name: 'Se déconnecter' }).click()
      await page.waitForURL('**/login')
    })

    test('cancels logout and keeps user on page', async ({ page }) => {
      await page.goto('/')
      await page.waitForTimeout(500)

      await page.getByRole('button', { name: 'Mon Profil' }).click()
      await page.locator('.absolute.right-0').getByText('Se déconnecter').click()

      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Annuler' }).click()

      await expect(dialog).not.toBeVisible()
    })
  })

  // ── Group page modals ─────────────────────────────────────────

  test.describe('Mobile sidebar drawer', () => {
    test('opens on tap and shows members + actions', async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      // Wait for group page to load
      await expect(page.getByText('Lancer un vote pour ce soir')).toBeVisible({ timeout: 10000 })

      // Tap the avatar bar to open mobile sidebar
      await page.getByRole('button', { name: 'Voir les membres' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(400) // Wait for drawer animation
      await expect(dialog.getByText('Les Gamers')).toBeVisible()

      // Members should be listed
      await expect(dialog.getByText('TestPlayer')).toBeVisible()
      await expect(dialog.getByText('Alice')).toBeVisible()
      await expect(dialog.getByText('Bob')).toBeVisible()

      // Action buttons visible in compact mode
      await expect(dialog.getByText('Synchroniser les bibliothèques')).toBeVisible()
      await expect(dialog.getByText('Inviter un ami')).toBeVisible()
      await expect(dialog.getByText('Supprimer le groupe')).toBeVisible()
    })

    test('shows vote history in sidebar', async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByText('Lancer un vote pour ce soir')).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: 'Voir les membres' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(400)
      await expect(dialog.getByText('Historique des soirées')).toBeVisible()
      await expect(dialog.getByText('Counter-Strike 2')).toBeVisible()
      await expect(dialog.getByText('Dota 2')).toBeVisible()
    })
  })

  test.describe('Leave Group confirmation', () => {
    test('opens from sidebar and confirms', async ({ page }) => {
      // Override the group detail to make user a member (not owner) so leave button appears
      await page.route(/\/api\/groups\/group-2$/, (route) => {
        if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          id: 'group-2', name: 'Squad B', createdBy: 'user-other', commonGameThreshold: null, createdAt: '2025-02-01',
          members: [
            { id: 'user-1', steamId: '1', displayName: 'TestPlayer', avatarUrl: '', libraryVisible: true, role: 'member', joinedAt: '2025-01-01' },
            { id: 'user-other', steamId: '2', displayName: 'Owner', avatarUrl: '', libraryVisible: true, role: 'owner', joinedAt: '2025-01-01' },
          ],
        }) })
      })

      await page.goto('/groups/group-2')
      await page.waitForTimeout(500)
      await expect(page.getByText('Lancer un vote pour ce soir')).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: 'Voir les membres' }).click()
      const sidebar = page.getByRole('dialog')
      await expect(sidebar).toBeVisible()
      await page.waitForTimeout(400)

      // Scroll to "Quitter le groupe" button in sidebar
      await sidebar.getByText('Quitter le groupe').scrollIntoViewIfNeeded()
      await sidebar.getByText('Quitter le groupe').click({ force: true })

      // Confirmation dialog
      await expect(page.getByText('Quitter le groupe ?')).toBeVisible()
      const confirmBtn = page.getByRole('button', { name: 'Quitter le groupe' }).last()
      await confirmBtn.scrollIntoViewIfNeeded()
      await confirmBtn.click({ force: true })

      await page.waitForURL('**/')
    })
  })

  test.describe('Delete Group confirmation', () => {
    test('opens from sidebar and confirms deletion', async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByText('Lancer un vote pour ce soir')).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: 'Voir les membres' }).click()
      const sidebar = page.getByRole('dialog')
      await expect(sidebar).toBeVisible()
      await page.waitForTimeout(400)

      await sidebar.getByText('Supprimer le groupe').scrollIntoViewIfNeeded()
      await sidebar.getByText('Supprimer le groupe').click({ force: true })

      await expect(page.getByText('Supprimer le groupe ?')).toBeVisible()
      await expect(page.getByText('irréversible')).toBeVisible()

      const confirmDeleteBtn = page.getByRole('button', { name: 'Supprimer le groupe' }).last()
      await confirmDeleteBtn.scrollIntoViewIfNeeded()
      await confirmDeleteBtn.click({ force: true })
      await page.waitForURL('**/')
    })
  })

  test.describe('Kick Member confirmation', () => {
    test('shows kick dialog for non-self members (owner view)', async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByText('Lancer un vote pour ce soir')).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: 'Voir les membres' }).click()
      const sidebar = page.getByRole('dialog')
      await expect(sidebar).toBeVisible()
      await page.waitForTimeout(400)

      // Kick button should be visible in compact mode (always visible)
      await sidebar.getByRole('button', { name: 'Exclure Alice' }).click({ force: true })

      await expect(page.getByText('Exclure ce membre ?')).toBeVisible()
      await expect(page.getByText('Alice sera retiré')).toBeVisible()

      await page.getByRole('button', { name: 'Exclure' }).click({ force: true })
    })
  })

  // ── Vote Setup modal ──────────────────────────────────────────

  test.describe('Vote Setup modal', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByText('Lancer un vote pour ce soir')).toBeVisible({ timeout: 10000 })
    })

    test('opens with all members selected by default', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await expect(dialog.getByText('3 joueur(s) sélectionné(s)')).toBeVisible()
    })

    test('toggles individual member selection via checkbox', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400) // Wait for drawer animation to settle

      // Click the label for Bob's checkbox (member-user-3)
      await dialog.locator('#member-user-3').click({ force: true })
      await expect(dialog.getByText('2 joueur(s) sélectionné(s)')).toBeVisible()

      // Re-check
      await dialog.locator('#member-user-3').click({ force: true })
      await expect(dialog.getByText('3 joueur(s) sélectionné(s)')).toBeVisible()
    })

    test('select all / deselect all toggle', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      // Deselect all
      await dialog.locator('#select-all').click({ force: true })
      await expect(dialog.getByText('0 joueur(s) sélectionné(s)')).toBeVisible()

      // Select all again
      await dialog.locator('#select-all').click({ force: true })
      await expect(dialog.getByText('3 joueur(s) sélectionné(s)')).toBeVisible()
    })

    test('proceeds to confirmation step and starts vote', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      const suivantBtn = dialog.getByRole('button', { name: 'Suivant' })
      await suivantBtn.scrollIntoViewIfNeeded()
      await suivantBtn.click({ force: true })
      await expect(dialog.getByText('Lancer le vote ?')).toBeVisible()
      await expect(dialog.getByText('42 jeux en commun disponibles')).toBeVisible()

      const lancerBtn = dialog.getByRole('button', { name: 'Lancer le vote' })
      await lancerBtn.scrollIntoViewIfNeeded()
      await lancerBtn.click({ force: true })
      await page.waitForURL('**/groups/group-1/vote')
    })

    test('schedule vote option shows date picker', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      const suivantBtn = dialog.getByRole('button', { name: 'Suivant' })
      await suivantBtn.scrollIntoViewIfNeeded()
      await suivantBtn.click({ force: true })

      // Toggle schedule
      await dialog.locator('#schedule-toggle').click({ force: true })
      await expect(dialog.locator('#scheduled-date')).toBeVisible()

      // Button label should change
      await expect(dialog.getByRole('button', { name: 'Planifier la soirée' })).toBeVisible()
    })

    test('back button returns to member selection', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      const suivantBtn = dialog.getByRole('button', { name: 'Suivant' })
      await suivantBtn.scrollIntoViewIfNeeded()
      await suivantBtn.click({ force: true })
      await expect(dialog.getByText('Lancer le vote ?')).toBeVisible()

      await dialog.getByRole('button', { name: 'Retour' }).click({ force: true })
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
    })

    test('disables Suivant when fewer than 2 members selected', async ({ page }) => {
      await page.getByText('Lancer un vote pour ce soir').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      // Deselect all
      await dialog.locator('#select-all').click({ force: true })
      // Select only one
      await dialog.locator('#member-user-1').click({ force: true })

      await expect(dialog.getByRole('button', { name: 'Suivant' })).toBeDisabled()
    })
  })

  // ── Random Pick modal ─────────────────────────────────────────

  test.describe('Random Pick modal', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByText('Au hasard')).toBeVisible({ timeout: 10000 })
    })

    test('opens with a random game displayed', async ({ page }) => {
      await page.getByText('Au hasard').click({ force: true })

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(400)

      // Should show a game name — the visible h2 (not sr-only title)
      const gameNames = mockGames.filter(g => g.type === 'game').map(g => g.gameName)
      const gameName = await dialog.locator('h2:not(.sr-only)').textContent()
      expect(gameNames).toContain(gameName)

      // Reroll and launch buttons visible
      await expect(dialog.getByRole('button', { name: 'Relancer' })).toBeVisible()
    })

    test('reroll changes pick number', async ({ page }) => {
      await page.getByText('Au hasard').click({ force: true })
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(400)

      await expect(dialog.getByText('Tirage #1')).toBeVisible()

      await dialog.getByRole('button', { name: 'Relancer' }).click({ force: true })
      await page.waitForTimeout(400)

      await expect(dialog.getByText('Tirage #2')).toBeVisible()
    })

    test('closes with Escape', async ({ page }) => {
      await page.getByText('Au hasard').click({ force: true })
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
    })
  })
})
