import { test, expect } from '@playwright/test'

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
