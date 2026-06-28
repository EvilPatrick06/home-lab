import { expect, test } from '@playwright/test'

// Smoke: the web build boots and renders the app shell into #root. Deterministic
// and offline (no live BMO Pi). This is the seed of the primary-loop coverage
// (launch -> create/import character -> campaign -> game table) the suggestions
// log calls for; expand incrementally.
test('web build boots and renders the app root', async ({ page }) => {
  await page.goto('/')
  const root = page.locator('#root')
  await expect(root).toBeAttached()
  await expect(root).not.toBeEmpty({ timeout: 30_000 })
})
