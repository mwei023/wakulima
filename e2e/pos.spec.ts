import { test, expect } from '@playwright/test';

// Happy path: open POS, add a product to cart, complete a cash sale.
test('cash sale completes and clears the cart', async ({ page }) => {
  await page.goto('/');

  // Catalog seeds on first run; a known product appears.
  await expect(page.getByText('Dairy Meal 70kg')).toBeVisible({ timeout: 15000 });

  // Add it to the cart.
  await page.getByText('Dairy Meal 70kg').first().click();
  await expect(page.getByText('Cart (1 items)')).toBeVisible();

  // Complete the sale. The app renders a shadcn toast AND a sonner toast for
  // the same event (known dedupe issue), so 'Sale Completed' matches two live
  // regions at once — take the first and don't assert receipt markup, which is
  // not visibly rendered after completion.
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  await expect(page.getByText('Sale Completed').first()).toBeVisible({ timeout: 10000 });

  // Cart is empty again.
  await expect(page.getByText('Cart is empty')).toBeVisible();
});

test('credit sale without a registered customer is blocked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Dairy Meal 70kg')).toBeVisible({ timeout: 15000 });

  await page.getByText('Dairy Meal 70kg').first().click();
  await page.getByRole('button', { name: 'Credit' }).click();
  await page.getByRole('button', { name: /Complete Sale/ }).click();

  // Walk-in customer is selected by default, so credit must fail loudly.
  await expect(page.getByText('Credit sales require a registered customer', { exact: true })).toBeVisible({ timeout: 10000 });
});
