import { test, expect } from './fixtures'

test('debug: groups page', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const buttons = await page.locator('button').allTextContents()
  console.log('GROUPS BUTTONS:', JSON.stringify(buttons))
  const body = await page.locator('body').textContent()
  console.log('GROUPS TEXT:', body?.substring(0, 2000))
})

test('debug: group detail page', async ({ page }) => {
  // Log all API requests
  page.on('request', r => { if (r.url().includes('/api/')) console.log('REQ:', r.method(), r.url()) })
  page.on('response', r => { if (r.url().includes('/api/')) console.log('RES:', r.status(), r.url()) })
  page.on('requestfailed', r => console.log('FAIL:', r.url(), r.failure()?.errorText))

  // Also log console errors from the page
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()) })
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message))

  await page.goto('/#/groups/group-1')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: '/tmp/mobile-group-detail.png', fullPage: true })
  console.log('URL:', page.url())
  const html = await page.locator('body').innerHTML()
  console.log('HTML:', html.substring(0, 2000))
})

test('debug: vote page', async ({ page }) => {
  await page.goto('/groups/group-1/vote')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const buttons = await page.locator('button').allTextContents()
  console.log('VOTE BUTTONS:', JSON.stringify(buttons))
  const body = await page.locator('body').textContent()
  console.log('VOTE TEXT:', body?.substring(0, 2000))
})
