import { test } from './fixtures'
import { writeFileSync } from 'node:fs'

test('diag history tab 2', async ({ page }) => {
  let body = '(none)'
  page.on('response', async (r) => {
    if (r.url().includes('/vote/history')) {
      try { body = 'status=' + r.status() + ' ct=' + (r.headers()['content-type'] || '') + ' body=' + (await r.text()).slice(0, 300) } catch (e) { body = 'err ' + String(e) }
    }
  })
  await page.goto('/groups/group-1')
  await page.getByRole('button', { name: 'Lancer un vote', exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('tab', { name: 'Historique' }).click()
  await page.waitForTimeout(2500)
  const text = await page.evaluate(() => document.body.innerText)
  writeFileSync('/tmp/diag-history2.txt', 'HISTORY RESPONSE: ' + body + '\n\nBODY:\n' + text)
})
