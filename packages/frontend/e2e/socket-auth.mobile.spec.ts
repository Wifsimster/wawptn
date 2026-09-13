import { test, expect } from '@playwright/test'

/**
 * Regression guard: the socket handshake is authenticated server-side from
 * the session cookie, so any connect attempt made while logged out is
 * rejected with `unauthorized` — which used to surface as a permanent
 * "Erreur de connexion / unauthorized" toast on the landing page.
 *
 * The culprit was lib/socket.ts's wake handlers (visibilitychange / online /
 * focus), which reconnected blindly as soon as the socket singleton existed.
 */
test.describe('socket connection while logged out', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      }),
    )
  })

  test('no handshake is attempted and no error toast is shown', async ({ page }) => {
    const socketRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/socket.io/')) socketRequests.push(req.url())
    })

    await page.goto('/')
    await expect(page.getByText('Se connecter avec Steam').first()).toBeVisible()

    // Replay the wake signals lib/socket.ts listens for: coming back to the
    // tab, regaining focus, and the network returning.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(3000)

    expect(
      socketRequests,
      `socket handshake attempted while logged out: ${socketRequests.join(', ')}`,
    ).toHaveLength(0)
    await expect(page.getByText('Erreur de connexion')).toHaveCount(0)
  })
})
