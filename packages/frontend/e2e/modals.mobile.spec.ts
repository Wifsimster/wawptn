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

      await dialog.getByPlaceholder('Colle ici le lien reçu...').fill('valid-token')
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
      // The dropdown menu Se déconnecter (Radix dropdown → role=menuitem)
      await page.getByRole('menuitem', { name: 'Se déconnecter' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Se déconnecter ?')).toBeVisible()

      await dialog.getByRole('button', { name: 'Se déconnecter' }).click()
      await page.waitForURL('**/')
    })

    test('cancels logout and keeps user on page', async ({ page }) => {
      await page.goto('/')
      await page.waitForTimeout(500)

      await page.getByRole('button', { name: 'Mon Profil' }).click()
      await page.getByRole('menuitem', { name: 'Se déconnecter' }).click()

      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Annuler' }).click()

      await expect(dialog).not.toBeVisible()
    })
  })

  // ── Group page panel tabs (members / history / settings) ──────
  // The mobile members sidebar drawer was replaced by persistent tabs on the
  // group detail page; members, history and owner actions now live under those
  // tabs (rendered inline, not in a dialog).

  test.describe('Members tab', () => {
    test('lists members and exposes the invite action', async ({ page }) => {
      await page.goto('/groups/group-1')
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('tab', { name: 'Membres' }).click()

      await expect(page.getByText('TestPlayer').first()).toBeVisible()
      await expect(page.getByText('Alice').first()).toBeVisible()
      await expect(page.getByText('Bob').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Inviter un ami' })).toBeVisible()
    })
  })

  test.describe('History tab', () => {
    test('shows past vote winners', async ({ page }) => {
      await page.goto('/groups/group-1')
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('tab', { name: 'Historique' }).click()

      await expect(page.getByText('Counter-Strike 2').first()).toBeVisible()
      await expect(page.getByText('Dota 2').first()).toBeVisible()
    })
  })

  test.describe('Settings tab', () => {
    test('exposes sync and delete actions to the owner', async ({ page }) => {
      await page.goto('/groups/group-1')
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('tab', { name: 'Réglages' }).click()

      await expect(page.getByRole('button', { name: 'Synchroniser les bibliothèques' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Supprimer le groupe' })).toBeVisible()
    })
  })

  test.describe('Leave Group confirmation', () => {
    test('member can leave from the settings tab', async ({ page }) => {
      // Override the group detail to make the user a member (not owner) so the
      // leave button appears.
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
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('tab', { name: 'Réglages' }).click()
      await page.getByRole('button', { name: 'Quitter le groupe' }).click()

      await expect(page.getByText('Quitter le groupe ?')).toBeVisible()
      await page.getByRole('button', { name: 'Quitter le groupe' }).last().click()

      await page.waitForURL('**/')
    })
  })

  test.describe('Delete Group confirmation', () => {
    test('owner can delete from the settings tab', async ({ page }) => {
      await page.goto('/groups/group-1')
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('tab', { name: 'Réglages' }).click()
      await page.getByRole('button', { name: 'Supprimer le groupe' }).click()

      await expect(page.getByText('Supprimer le groupe ?')).toBeVisible()
      await expect(page.getByText('irréversible')).toBeVisible()

      await page.getByRole('button', { name: 'Supprimer le groupe' }).last().click()
      await page.waitForURL('**/')
    })
  })

  test.describe('Kick Member confirmation', () => {
    test('owner can kick a member from the members tab', async ({ page }) => {
      await page.goto('/groups/group-1')
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('tab', { name: 'Membres' }).click()
      await page.getByRole('button', { name: 'Exclure Alice' }).click()

      await expect(page.getByText('Exclure ce membre ?')).toBeVisible()
      await expect(page.getByText('Alice sera retiré')).toBeVisible()

      await page.getByRole('button', { name: 'Exclure', exact: true }).click()
    })
  })

  // ── Vote Setup modal ──────────────────────────────────────────

  test.describe('Vote Setup modal', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('opens with all members selected by default', async ({ page }) => {
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await expect(dialog.getByText('3 joueur(s) sélectionné(s)')).toBeVisible()
    })

    test('toggles individual member selection via checkbox', async ({ page }) => {
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
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
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
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

    test('quick-starts the vote from the member step', async ({ page }) => {
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      const lancerBtn = dialog.getByRole('button', { name: 'Lancer le vote' })
      await lancerBtn.scrollIntoViewIfNeeded()
      await lancerBtn.click({ force: true })
      await page.waitForURL('**/groups/group-1/vote')
    })

    test('"Plus d\'options" opens the confirm step and starts the vote', async ({ page }) => {
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      const moreBtn = dialog.getByRole('button', { name: "Plus d'options" })
      await moreBtn.scrollIntoViewIfNeeded()
      await moreBtn.click({ force: true })
      await expect(dialog.getByText('Lancer le vote ?')).toBeVisible()

      const lancerBtn = dialog.getByRole('button', { name: 'Lancer le vote' })
      await lancerBtn.scrollIntoViewIfNeeded()
      await lancerBtn.click({ force: true })
      await page.waitForURL('**/groups/group-1/vote')
    })

    test('schedule option (premium) reveals the date picker', async ({ page }) => {
      // Scheduling is premium-gated; grant premium then reload so the
      // subscription store picks it up before the dialog opens.
      await page.route('**/api/subscription/me', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tier: 'premium', status: 'active', currentPeriodEnd: '2026-12-31', cancelAtPeriodEnd: false, source: 'stripe' }) })
      )
      await page.reload()
      await expect(page.getByRole('button', { name: 'Lancer un vote', exact: true })).toBeVisible({ timeout: 10000 })

      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      await dialog.getByRole('button', { name: "Plus d'options" }).click({ force: true })

      // Toggle schedule
      await dialog.locator('#schedule-toggle').click({ force: true })
      await expect(dialog.locator('#scheduled-date')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Planifier la soirée' })).toBeVisible()
    })

    test('back button returns to member selection', async ({ page }) => {
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      await dialog.getByRole('button', { name: "Plus d'options" }).click({ force: true })
      await expect(dialog.getByText('Lancer le vote ?')).toBeVisible()

      await dialog.getByRole('button', { name: 'Retour' }).click({ force: true })
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
    })

    test('start buttons are disabled when fewer than 2 members selected', async ({ page }) => {
      await page.getByRole('button', { name: 'Lancer un vote', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Qui joue ce soir ?')).toBeVisible()
      await page.waitForTimeout(400)

      // Deselect all, then select only one
      await dialog.locator('#select-all').click({ force: true })
      await dialog.locator('#member-user-1').click({ force: true })

      await expect(dialog.getByRole('button', { name: 'Lancer le vote' })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: "Plus d'options" })).toBeDisabled()
    })
  })

  // ── Random Pick modal ─────────────────────────────────────────

  test.describe('Random Pick modal', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/groups/group-1')
      await page.waitForTimeout(500)
      await expect(page.getByRole('button', { name: 'Au hasard' })).toBeVisible({ timeout: 10000 })
    })

    test('opens with a random game displayed', async ({ page }) => {
      await page.getByRole('button', { name: 'Au hasard' }).click({ force: true })

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
      await page.getByRole('button', { name: 'Au hasard' }).click({ force: true })
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(400)

      await expect(dialog.getByText('Tirage #1')).toBeVisible()

      await dialog.getByRole('button', { name: 'Relancer' }).click({ force: true })
      await page.waitForTimeout(400)

      await expect(dialog.getByText('Tirage #2')).toBeVisible()
    })

    test('closes with Escape', async ({ page }) => {
      await page.getByRole('button', { name: 'Au hasard' }).click({ force: true })
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
    })
  })
})
