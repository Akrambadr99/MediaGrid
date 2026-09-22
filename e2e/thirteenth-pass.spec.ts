import { expect, test } from '@playwright/test'

test('named territory reviewer claims manifest rights before adoption', async ({ page }) => {
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await page.getByLabel('Master version').selectOption('13')
  await page.getByRole('button', { name: 'Create manifest' }).click()
  await page.goto('/productions/PROD-77/reviews/R12/compare?version=13')
  await page.getByRole('button', { name: 'Request rights review' }).click()
  await page.getByLabel('Named rights reviewer').selectOption('rights-maya')
  await page.getByRole('button', { name: 'Claim rights review' }).click()
  await expect(page.getByLabel('Rights review inbox')).toContainText('rights-maya · open')
  await page.reload()
  await page.getByLabel('Decision authority').selectOption('rights approver')
  await page.getByRole('button', { name: 'Adopt reviewed version' }).click()
  await expect(page.getByLabel('Rights review inbox')).toContainText('rights-maya · completed')
})
