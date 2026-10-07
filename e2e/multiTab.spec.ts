import { test, expect } from '@playwright/test';

// Two tabs on the same device share one IndexedDB. A sale in tab A must
// update tab B's stock badge (and everything else reading the store) without
// a reload — liveQuery pushes the change across tabs.
test('a sale in one tab updates stock in another tab', async ({ browser }) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  const tabB = await context.newPage();

  await tabA.goto('/');
  await tabB.goto('/');

  const productCard = tabA.getByText('Dairy Meal 70kg').first();
  await expect(productCard).toBeVisible({ timeout: 15000 });
  await expect(tabB.getByText('Dairy Meal 70kg').first()).toBeVisible({ timeout: 15000 });

  // Grab the starting stock from tab A's badge ("N bags").
  const badgeA = tabA.locator('div.cursor-pointer', { hasText: 'Dairy Meal 70kg' }).getByText(/\d+ bags/);
  const stockBefore = await badgeA.textContent();
  expect(stockBefore).toBeTruthy();

  // Sell one unit in tab A.
  await productCard.click();
  await expect(tabA.getByText('Cart (1 items)')).toBeVisible();
  await tabA.getByRole('button', { name: /Complete Sale/ }).click();
  await expect(tabA.getByText('Sale Completed').first()).toBeVisible({ timeout: 10000 });

  // Tab B shows the decremented stock without any reload.
  const badgeB = tabB.locator('div.cursor-pointer', { hasText: 'Dairy Meal 70kg' }).getByText(/\d+ bags/);
  await expect(badgeB).not.toHaveText(stockBefore!, { timeout: 10000 });
  // And specifically one less than before (parse "N bags").
  const afterCount = parseInt((await badgeB.textContent()) ?? '', 10);
  const beforeCount = parseInt(stockBefore ?? '', 10);
  expect(afterCount).toBe(beforeCount - 1);

  await context.close();
});
