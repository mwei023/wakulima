import { test, expect } from '@playwright/test';

// Admin voids a completed sale from the Sales history tab.
// A fresh context has no session, and the app defaults to the admin user.
test('admin can void a completed sale from sales history', async ({ page }) => {
  await page.goto('/');

  // Make one cash sale.
  await expect(page.getByText('Dairy Meal 70kg')).toBeVisible({ timeout: 15000 });
  await page.getByText('Dairy Meal 70kg').first().click();
  await expect(page.getByText('Cart (1 items)')).toBeVisible();
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  await expect(page.getByText('Sale Completed').first()).toBeVisible({ timeout: 10000 });

  // Open the Sales tab (admin sees it) and void the sale with a reason.
  await page.getByRole('tab', { name: 'Sales' }).click();
  await expect(page.getByText('Counted total')).toBeVisible();
  await page.getByRole('button', { name: 'Void' }).click();
  await page
    .getByPlaceholder('Why is this sale being voided?')
    .fill('Customer paid with wrong currency; sale was re-entered in cash');
  await page.getByRole('button', { name: 'Void sale' }).click();

  // Sale is voided: toast, row badge, and totals exclude it now.
  // (Chromium's en-KE ICU renders KES as "K Sh"; Node's renders "KES".)
  await expect(page.getByText('Sale voided').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Voided').first()).toBeVisible();
  await expect(page.getByText(/Counted total/)).toContainText(/(KES|Ksh|K Sh)\s*0$/);
});
