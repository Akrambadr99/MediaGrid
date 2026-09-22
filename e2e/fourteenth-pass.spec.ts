import { expect, test } from '@playwright/test'

test('territory reviewer and grant propagation remain scoped across navigation', async ({ page }) => {
  await page.goto('/delivery/rights-workspace?production=PROD-78')
  await expect(page.getByLabel('Rights queue')).toContainText('PROD-78')
  await page.getByRole('button', { name: 'Claim selected rights review' }).click()
  await expect(page.getByRole('status')).toContainText('claimed')
  await page.getByLabel('Production collection').getByRole('button', { name: /PROD-80/ }).click()
  await page.goto('/operations')
  await page.goto('/delivery/rights-workspace?production=PROD-78')
  await expect(page.getByLabel('Selected production')).toContainText('rights-maya')
  await page.getByRole('button', { name: 'Toggle linked rights grant' }).click()
  await expect(page.getByRole('status')).toContainText('related productions updated')
  await expect(page.getByLabel('Production collection')).toContainText('PROD-80')
  await expect(page.getByLabel('Selected production')).toContainText('invalid')
  await page.reload()
  await expect(page.getByLabel('Selected production')).toContainText('invalid')
})
