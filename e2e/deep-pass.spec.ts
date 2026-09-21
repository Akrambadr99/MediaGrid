import { expect, test } from '@playwright/test'
test('delivery manifest pins cleared rights and compatible versions', async ({ page }) => {
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await expect(page.getByText('Captions are behind the target specification.')).toBeVisible()
  await page.getByLabel('Master version').selectOption('13')
  await page.getByRole('button', { name: 'Create manifest' }).click()
  await expect(page.getByText('RG-EU-4')).toBeVisible()
})
