import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { startBackupServer, type BackupServerHandle } from '../../server/backup-server.mjs';
import { db, seedLocal, processLocalSale, nextSeq, RECEIPT_SEQ_KEY } from './db';
import { createBackupPayload, restoreFromPayload } from './backup';
import { STORE_ID } from './backend';

// The "device lost" rehearsal (ADR-001 Phase 2.1), end to end against the
// REAL receiver code: build payload → POST /backup → (new till) GET /latest
// → restore → products, credit balances, sales AND the receipt counter all
// come back. Money stays integer cents throughout.

let handle: BackupServerHandle;

beforeAll(async () => {
  process.env.BACKUP_TOKEN = 'test-token';
  // Tight pruning to prove the receiver keeps only the newest few.
  process.env.MAX_SNAPSHOTS = '2';
  await fs.rm('.tmp-receiver-backups', { recursive: true, force: true });
  handle = await startBackupServer({ port: 0, backupDir: '.tmp-receiver-backups' });
});

afterAll(async () => {
  handle?.server.close();
  await new Promise<void>(resolve => handle?.server.close(() => resolve()));
});

beforeEach(async () => {
  await db.transaction(
    'rw',
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit, db.localMeta],
    async () => {
      await Promise.all([
        db.localProducts.clear(),
        db.localCustomers.clear(),
        db.localSales.clear(),
        db.localReturns.clear(),
        db.localAudit.clear(),
        db.localMeta.clear(),
      ]);
    }
  );
  localStorage.clear();
  await seedLocal();
});

const base = () => `http://127.0.0.1:${handle.port}`;
const authed = { 'content-type': 'application/json', 'x-backup-token': 'test-token' };

async function wipeEverything() {
  await db.transaction(
    'rw',
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit, db.localMeta],
    async () => {
      await Promise.all([
        db.localProducts.clear(),
        db.localCustomers.clear(),
        db.localSales.clear(),
        db.localReturns.clear(),
        db.localAudit.clear(),
        db.localMeta.clear(),
      ]);
    }
  );
}

describe('LAN receiver end-to-end', () => {
  it('answers /health', async () => {
    const res = await fetch(`${base()}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('full rehearsal: push → lose device → new till pulls /latest → restore matches totals and receipts', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;

    // Old till: one credit sale (1000 cents × 2) — stock and balance move.
    const saleId = await processLocalSale(
      STORE_ID, customer.id, 'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: 1000, total_line: 2000 }],
      2000
    );
    await nextSeq(RECEIPT_SEQ_KEY); // counter advanced past 1 by the sale
    const stockAtBackup = (await db.localProducts.get(product.id))!.stock_quantity;
    const balanceAtBackup = (await db.localCustomers.get(customer.id))!.outstanding_balance;

    // Push the snapshot to the receiver.
    const pushRes = await fetch(`${base()}/backup`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify(await createBackupPayload()),
    });
    expect(pushRes.status).toBe(200);
    expect(await pushRes.json()).toMatchObject({ ok: true });

    // Catastrophe: the till (and its IndexedDB) is gone.
    await wipeEverything();
    expect(await db.localSales.count()).toBe(0);
    expect(await db.localProducts.count()).toBe(0);

    // New till pulls the off-device copy and restores it.
    const pullRes = await fetch(`${base()}/latest`);
    expect(pullRes.status).toBe(200);
    const recovered = await pullRes.json();
    await restoreFromPayload(recovered);

    // Money and stock came back exactly as they were at backup time.
    const restoredProduct = await db.localProducts.get(product.id);
    expect(restoredProduct!.stock_quantity).toBe(stockAtBackup);
    expect(Number.isInteger(restoredProduct!.selling_price)).toBe(true);
    const restoredCustomer = await db.localCustomers.get(customer.id);
    expect(restoredCustomer!.outstanding_balance).toBe(balanceAtBackup);
    const sale = await db.localSales.get(saleId);
    expect(sale).toBeDefined();
    expect(sale!.total_amount).toBe(2000);
    expect(sale!.items[0].unit_price).toBe(1000);

    // Receipt numbering CONTINUES — it does not restart at 1.
    const counter = (await db.localMeta.get(RECEIPT_SEQ_KEY))?.value ?? 0;
    expect(counter).toBeGreaterThanOrEqual(1);
    const next = await nextSeq(RECEIPT_SEQ_KEY);
    expect(next).toBe(counter + 1);
  });

  it('rejects pushes with a wrong token and malformed payloads', async () => {
    const bad = await fetch(`${base()}/backup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-backup-token': 'wrong' },
      body: JSON.stringify(await createBackupPayload()),
    });
    expect(bad.status).toBe(401);

    const malformed = await fetch(`${base()}/backup`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(malformed.status).toBe(400);

    const notJson = await fetch(`${base()}/backup`, {
      method: 'POST',
      headers: authed,
      body: 'not json at all',
    });
    expect(notJson.status).toBe(400);
  });

  it('snapshots are pruned to the newest MAX_SNAPSHOTS and /latest serves the newest', async () => {
    const baseline = (await (await fetch(`${base()}/snapshots`)).json()).snapshots.length;
    for (let i = 0; i < 3; i++) {
      await db.localMeta.put({ key: `probe-${i}`, value: i });
      const res = await fetch(`${base()}/backup`, {
        method: 'POST',
        headers: authed,
        body: JSON.stringify(await createBackupPayload()),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, snapshots_on_disk: 2 }); // always the cap after prune
    }
    const list = await fetch(`${base()}/snapshots`);
    const body = await list.json();
    expect(body.ok).toBe(true);
    expect(body.snapshots.length).toBe(2); // pruned to MAX_SNAPSHOTS

    const latest = await fetch(`${base()}/latest`);
    const payload = await latest.json();
    expect(payload.schema_version).toBe(3);
    expect(Array.isArray(payload.products)).toBe(true);
    // /latest is the newest push (probe-2), not the first.
    expect(payload.meta.find((m: { key: string }) => m.key === 'probe-2')?.value).toBe(2);
  });
});
