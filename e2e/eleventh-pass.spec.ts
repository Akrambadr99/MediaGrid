import { expect, test } from '@playwright/test'

test('delivery producer hands published manifest to rights approval', async ({ page }) => {
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await page.getByLabel('Master version').selectOption('13')
  await page.getByRole('button', { name: 'Create manifest' }).click()
  await page.goto('/productions/PROD-77/reviews/R12/compare?version=13')
  await expect(page.getByText('Queue: rights-review')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Adopt reviewed version' })).toBeDisabled()
  await page.getByLabel('Decision authority').selectOption('rights approver')
  await page.getByRole('button', { name: 'Adopt reviewed version' }).click()
  await expect(page.getByText('Rights approver: rights approver')).toBeVisible()
})
