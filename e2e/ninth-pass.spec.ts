import { expect, test } from '@playwright/test'

test('rights-cleared manifest governs review adoption and protects cancellation', async ({ page }) => {
  await page.goto('/productions/PROD-77/reviews/R12/compare?version=13')
  await page.getByLabel('Decision authority').selectOption('rights approver')
  await expect(page.getByRole('button', { name: 'Adopt reviewed version' })).toBeDisabled()
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await page.getByLabel('Master version').selectOption('13')
  await page.getByRole('button', { name: 'Create manifest' }).click()
  await page.goto('/productions/PROD-77/reviews/R12/compare?version=13')
  await page.getByLabel('Decision authority').selectOption('rights approver')
  await page.getByRole('button', { name: 'Adopt reviewed version' }).click()
  await expect(page.getByText('Review v13 adopted')).toBeVisible()
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await page.getByRole('button', { name: 'Cancel manifest' }).click()
  await expect(page.getByRole('status')).toContainText('Adopted review depends')
})
