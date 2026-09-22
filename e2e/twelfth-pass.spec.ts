import { expect, test } from '@playwright/test'

test('published delivery creates durable rights handoff across routes', async ({ page }) => {
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await page.getByLabel('Master version').selectOption('13')
  await page.getByRole('button', { name: 'Create manifest' }).click()
  await page.goto('/productions/PROD-77/reviews/R12/compare?version=13')
  await page.getByRole('button', { name: 'Request rights review' }).click()
  await expect(page.getByLabel('Rights review inbox')).toContainText('rights approver · open')
  await page.goto('/productions/PROD-77/delivery/STREAM-EU')
  await page.goto('/productions/PROD-77/reviews/R12/compare?version=13')
  await page.getByLabel('Decision authority').selectOption('rights approver')
  await expect(page.getByLabel('Rights review inbox')).toContainText('1 assigned here')
  await page.getByRole('button', { name: 'Adopt reviewed version' }).click()
  await expect(page.getByLabel('Rights review inbox')).toContainText('rights approver · completed')
})
