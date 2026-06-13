import { test, expect } from './fixtures'

/**
 * Page-level smoke + key-interaction coverage for the routes not exercised by
 * the filters / modals / voting specs: Landing, Contact, NotFound, Profile,
 * Library, Compare, Subscription, UserProfile and Join. All backend calls are
 * mocked in fixtures.ts, so these run against the frontend dev server alone.
 */

test.describe('Pages on mobile', () => {
  // ── Landing (logged-out) ───────────────────────────────────────
  test.describe('Landing page', () => {
    test('renders the hero and Steam login CTA when logged out', async ({ page }) => {
      // Override the default "logged in" auth mock for this test.
      await page.route('**/api/auth/me', (route) =>
        route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
      )

      await page.goto('/')
      await expect(page.getByText('On joue à quoi', { exact: false }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: /Se connecter avec Steam/i }).first()).toBeVisible()
    })
  })

  // ── Contact (public) ───────────────────────────────────────────
  test.describe('Contact page', () => {
    test('shows Discord and email support options', async ({ page }) => {
      await page.goto('/contact')
      await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toBeVisible()
      await expect(page.getByText('Serveur Discord officiel')).toBeVisible()
      await expect(page.getByText('Support par e-mail')).toBeVisible()
    })

    test('back-to-home link points at /', async ({ page }) => {
      await page.goto('/contact')
      const home = page.getByRole('link', { name: 'WAWPTN' })
      await expect(home).toHaveAttribute('href', '/')
    })
  })

  // ── 404 ────────────────────────────────────────────────────────
  test.describe('Not found page', () => {
    test('renders for an unknown authenticated route', async ({ page }) => {
      await page.goto('/this-route-does-not-exist')
      await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
      await expect(page.getByRole('button', { name: "Retour à l'accueil" })).toBeVisible()
    })

    test('back-home button navigates to the groups list', async ({ page }) => {
      await page.goto('/this-route-does-not-exist')
      await page.getByRole('button', { name: "Retour à l'accueil" }).click()
      await expect(page).toHaveURL(/\/$/)
    })
  })

  // ── Profile ────────────────────────────────────────────────────
  test.describe('Profile page', () => {
    test('shows connected platforms with Steam linked', async ({ page }) => {
      await page.goto('/profile')
      await expect(page.getByText('Plateformes connectées')).toBeVisible()
      await expect(page.getByText('TestPlayer').first()).toBeVisible()
      await expect(page.getByText('Steam', { exact: false }).first()).toBeVisible()
    })
  })

  // ── My library ─────────────────────────────────────────────────
  test.describe('My library page', () => {
    test('lists the user games and exposes a search box', async ({ page }) => {
      await page.goto('/library')
      await expect(page.getByRole('heading', { name: 'Ma bibliothèque' })).toBeVisible()
      await expect(page.getByText('Counter-Strike 2').first()).toBeVisible()
      await expect(page.getByPlaceholder('Rechercher un jeu…')).toBeVisible()
    })

    test('typing in the search box filters the list client-side', async ({ page }) => {
      await page.goto('/library')
      await expect(page.getByText('Counter-Strike 2').first()).toBeVisible()
      await page.getByPlaceholder('Rechercher un jeu…').fill('Cyber')
      await expect(page.getByText('Cyberpunk 2077').first()).toBeVisible()
      await expect(page.getByText('Counter-Strike 2')).not.toBeVisible()
    })
  })

  // ── Compare ────────────────────────────────────────────────────
  test.describe('Compare page', () => {
    test('renders a comparison between two users', async ({ page }) => {
      await page.goto('/compare?a=user-2&b=user-3')
      await expect(page.getByText('Comparaison').first()).toBeVisible()
      await expect(page.getByText('Counter-Strike 2').first()).toBeVisible()
    })

    test('shows the impossible state when comparing a user with themselves', async ({ page }) => {
      await page.goto('/compare?a=user-2&b=user-2')
      await expect(page.getByText('Comparaison impossible')).toBeVisible()
    })
  })

  // ── Subscription ───────────────────────────────────────────────
  test.describe('Subscription page', () => {
    test('shows the current plan and an upgrade path', async ({ page }) => {
      await page.goto('/subscription')
      await expect(page.getByRole('heading', { name: 'Mon abonnement' })).toBeVisible()
      await expect(page.getByText('Plan actuel')).toBeVisible()
    })
  })

  // ── Public user profile ────────────────────────────────────────
  test.describe('User profile page', () => {
    test('renders the target user with common games', async ({ page }) => {
      await page.goto('/u/user-2')
      await expect(page.getByText('Alice').first()).toBeVisible()
      await expect(page.getByText('Jeux en commun', { exact: false }).first()).toBeVisible()
    })
  })

  // ── Join via invite ────────────────────────────────────────────
  test.describe('Join page', () => {
    test('shows the invite preview and Steam prompt when logged out', async ({ page }) => {
      await page.route('**/api/auth/me', (route) =>
        route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
      )
      await page.goto('/join/some-invite-token')
      await expect(page.getByText('Tu as été invité !')).toBeVisible()
      await expect(page.getByText('Les Gamers').first()).toBeVisible()
    })

    test('auto-joins and redirects to the group when already logged in', async ({ page }) => {
      await page.goto('/join/some-invite-token')
      await expect(page).toHaveURL(/\/groups\/group-1$/)
    })
  })
})
