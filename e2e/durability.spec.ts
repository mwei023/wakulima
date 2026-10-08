import { test, expect, type Page } from '@playwright/test';

// Durability drills (Phase 1.4): the two failure modes that would cost the
// shop real money — a sale silently lost across a reload, and a wiped
// database that can't be restored from backup.

const PRODUCT = 'Dairy Meal 70kg';

// The product card, not any hidden duplicate (a lingering toast can carry the
// same product name and getByText would match it first).
function productCard(page: Page) {
  return page.locator('div.cursor-pointer', { hasText: PRODUCT }).first();
}

async function makeCashSale(page: Page) {
  await productCard(page).click();
  await expect(page.getByText('Cart (1 items)')).toBeVisible();
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  await expect(page.getByText('Sale Completed').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Cart is empty')).toBeVisible();
}

test('a sale made offline survives a page reload', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText(PRODUCT)).toBeVisible({ timeout: 15000 });

  // The reload below must be served by the PWA service worker, not the
  // (soon dead) network. Wait until the SW controls this page.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 15000 });

  // Pull the network plug. The app is local-only (IndexedDB + PWA precache),
  // so selling must keep working.
  await context.setOffline(true);
  await makeCashSale(page);

  // Reload: app shell comes from the service worker, data from IndexedDB.
  await page.reload();
  await expect(page.getByText(PRODUCT)).toBeVisible({ timeout: 20000 });

  // The sale is still there: Sales tab shows a non-zero counted total.
  await page.getByRole('tab', { name: 'Sales' }).click();
  await expect(page.getByText('Counted total')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Counted total/)).not.toContainText(/(KES|Ksh|K Sh)\s*0$/);

  await context.setOffline(false);
});

test('backup → wipe → restore: totals match', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(PRODUCT)).toBeVisible({ timeout: 15000 });

  // Two real sales to create money totals worth preserving.
  await makeCashSale(page);
  await makeCashSale(page);

  // Record the counted total before anything destructive happens.
  await page.getByRole('tab', { name: 'Sales' }).click();
  await expect(page.getByText('Counted total')).toBeVisible({ timeout: 15000 });
  const totalBefore = await page.getByText(/Counted total/).textContent();
  expect(totalBefore).toBeTruthy();
  expect(totalBefore).not.toMatch(/(KES|Ksh|K Sh)\s*0$/);

  // Download the full JSON backup (the off-device copy).
  test.setTimeout(120_000); // heavy drill: sales + wipe + reload + restore
  await page.getByRole('tab', { name: 'Backup' }).click();
  await expect(page.getByRole('button', { name: /Download Full Backup/ })).toBeVisible({ timeout: 15000 });
  // Known app quirk (toast dedupe is Phase 3 backlog): the 'Sale Completed'
  // toast lingers and intercepts pointer events on the bottom-right buttons.
  // Neutralize it so the drill can use the backup controls.
  await page.addStyleTag({
    content:
      '[role="region"][aria-label*="Notifications"], [role="region"][aria-label*="Notifications"] * { pointer-events: none !important; }',
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download Full Backup/ }).click(),
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  // Catastrophe: wipe the main database out from under the app. Dexie closes
  // its connection on versionchange, so the delete goes through; the separate
  // backups DB is intentionally NOT deleted.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('WakulimaAgrovetDB');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
        req.onblocked = () => reject(new Error('deleteDatabase was blocked'));
      })
  );

  // Reload: the app reseeds an empty till — sales and totals are gone.
  await page.reload();
  await expect(page.getByText(PRODUCT)).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: 'Sales' }).click();
  await expect(page.getByText(/Counted total/)).toContainText(/(KES|Ksh|K Sh)\s*0$/);

  // Restore from the downloaded file. The restore asks for confirmation via
  // window.confirm, which Playwright auto-dismisses unless we accept it.
  page.on('dialog', dialog => void dialog.accept());
  await page.getByRole('tab', { name: 'Backup' }).click();
  await expect(page.getByRole('button', { name: /Restore from Backup File/ })).toBeVisible({ timeout: 10000 });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Restore from Backup File/ }).click(),
  ]);
  await chooser.setFiles(backupPath!);
  await expect(page.getByText('Restore Complete').first()).toBeVisible({ timeout: 15000 });

  // Totals match the pre-wipe value.
  await page.getByRole('tab', { name: 'Sales' }).click();
  await expect(page.getByText(/Counted total/)).toContainText(/Counted total/);
  const totalAfter = await page.getByText(/Counted total/).textContent();
  expect(totalAfter).toBe(totalBefore);
});
