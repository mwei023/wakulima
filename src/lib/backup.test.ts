import { describe, it, expect, beforeEach } from 'vitest';
import {
  backupDb,
  saveRollingBackup,
  listBackups,
  getBackup,
  latestBackupMeta,
  restoreFromPayload,
  runRollingBackupIfDue,
  createBackupPayload,
  MAX_BACKUPS,
} from './backup';
import { db, seedLocal, processLocalSale } from './db';
import { STORE_ID } from './backend';

beforeEach(async () => {
  await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit], async () => {
    await db.localProducts.clear();
    await db.localCustomers.clear();
    await db.localSales.clear();
    await db.localReturns.clear();
    await db.localAudit.clear();
  });
  await backupDb.snapshots.clear();
  localStorage.clear();
  await seedLocal();
});

describe('rolling backups', () => {
  it('captures the full payload and keeps only the newest MAX_BACKUPS', async () => {
    for (let i = 0; i < MAX_BACKUPS + 3; i++) {
      await saveRollingBackup();
      // Nudge created_at so each snapshot is distinct.
      await new Promise(r => setTimeout(r, 2));
    }

    const backups = await listBackups();
    expect(backups).toHaveLength(MAX_BACKUPS);

    const latest = await latestBackupMeta();
    expect(latest).not.toBeNull();
    expect(backups[0].id).toBe(latest!.id);

    const payload = await getBackup(latest!.id);
    expect(payload).not.toBeNull();
    expect(payload!.schema_version).toBe(1);
    expect(payload!.products.length).toBeGreaterThan(0);
    expect(payload!.customers.length).toBeGreaterThan(0);
  });

  it('restores stock, sales and credit balances after a wipe', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in' && c.credit_limit > 0)!;
    const beforeStock = product.stock_quantity;
    const beforeBalance = customer.outstanding_balance;

    // Snapshot the pristine state.
    await saveRollingBackup();

    // Mutate: a credit sale decrements stock and raises the balance.
    await processLocalSale(
      STORE_ID,
      customer.id,
      'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 3, unit_price: product.selling_price, total_line: product.selling_price * 3 }],
      product.selling_price * 3
    );
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(beforeStock - 3);
    expect(await db.localSales.count()).toBe(1);

    // Simulate data loss: wipe every main table.
    await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit], async () => {
      await db.localProducts.clear();
      await db.localCustomers.clear();
      await db.localSales.clear();
      await db.localReturns.clear();
      await db.localAudit.clear();
    });
    expect(await db.localProducts.count()).toBe(0);

    // Restore.
    const latest = (await latestBackupMeta())!;
    await restoreFromPayload((await getBackup(latest.id))!);

    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(beforeStock);
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(beforeBalance);
    expect(await db.localSales.count()).toBe(0);
  });

  it('rejects restore of an unknown schema version', async () => {
    const payload = await createBackupPayload();
    await expect(
      restoreFromPayload({ ...payload, schema_version: 999 as unknown as 1 })
    ).rejects.toThrow(/Unsupported backup schema version/);
  });

  it('runRollingBackupIfDue runs once, then stays quiet within the window', async () => {
    expect(await runRollingBackupIfDue()).toBe(true);
    expect(await runRollingBackupIfDue()).toBe(false);

    const count1 = (await listBackups()).length;
    expect(count1).toBe(1);

    // Simulate a stale marker: 21h old -> due again.
    const stale = new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('wakulima-last-rolling-backup', stale);
    expect(await runRollingBackupIfDue()).toBe(true);
    expect((await listBackups()).length).toBe(2);
  });
});
