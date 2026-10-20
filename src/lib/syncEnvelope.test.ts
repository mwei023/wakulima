import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  db,
  seedLocal,
  createSyncedRecord,
  processLocalSale,
  createLocalReturn,
  updateLocalReturnStatus,
  voidLocalSale,
  createCreditPayment,
  createStockAdjustment,
  createOpeningBalanceEvent,
  computeProductStock,
  computeCustomerBalance,
  recomputeDerivedState,
  DEVICE_SEQ_KEY,
  SYNC_PUSH_ACK_KEY,
  SYNC_PULL_SEQ_KEY,
} from '@/lib/db';
import { STORE_ID } from '@/lib/backend';
import { configureSync, applyPullPage, pushOnce } from '@/lib/sync-client';

const REMOTE_DEVICE = '11111111-2222-3333-4444-555555555555';

async function clearAll() {
  await db.transaction(
    'rw',
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localPayments, db.localAdjustments, db.localAudit, db.localOutbox, db.localMeta],
    async () => {
      await Promise.all([
        db.localProducts.clear(),
        db.localCustomers.clear(),
        db.localSales.clear(),
        db.localReturns.clear(),
        db.localPayments.clear(),
        db.localAdjustments.clear(),
        db.localAudit.clear(),
        db.localOutbox.clear(),
        db.localMeta.clear(),
      ]);
    },
  );
}

beforeEach(async () => {
  await clearAll();
  await seedLocal();
});

describe('v7 envelope: seeds and writes', () => {
  it('stamps every seeded row with a monotonic per-device envelope', async () => {
    const products = await db.localProducts.toArray();
    const customers = await db.localCustomers.toArray();
    expect(products.every(p => typeof p.device_seq === 'number' && p.device_seq > 0 && !!p.device_id)).toBe(true);
    expect(customers.every(c => typeof c.device_seq === 'number' && typeof c.updated_at === 'string')).toBe(true);
    const seqs = products.map(p => p.device_seq!).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(seqs.length);
    // Opening stock folded in from the seed (opening == current, no legacy corpus).
    expect(products.every(p => p.opening_stock === p.stock_quantity)).toBe(true);
  });

  it('queues the frozen wire version of every write in the outbox', async () => {
    const product = (await db.localProducts.toArray())[0];
    await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: product.selling_price, total_line: product.selling_price * 2 }],
      product.selling_price * 2,
    );

    const outbox = await db.localOutbox.where('seq').above(0).sortBy('seq');
    const saleEntry = outbox.find(e => e.table === 'sales')!;
    expect(saleEntry).toBeDefined();
    const wire = saleEntry.record;
    // The server column set, verbatim (rowLooksSane rejects missing columns).
    for (const col of ['id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'customer_id', 'total_amount', 'payment_method', 'mpesa_reference', 'receipt_number', 'status', 'timestamp', 'store_id']) {
      expect(col in wire).toBe(true);
    }
    expect(wire.mpesa_reference).toBeNull();
    expect(wire.deleted_at).toBeNull();
    // Sale items ride their sale's version as children.
    expect(saleEntry.children?.table).toBe('sale_items');
    const itemWire = saleEntry.children!.records[0];
    for (const col of ['id', 'sale_id', 'product_id', 'product_name', 'quantity', 'unit_price', 'total_line', 'item_seq']) {
      expect(col in itemWire).toBe(true);
    }
  });

  it('credits a payment event and moves the balance down', async () => {
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in' && c.outstanding_balance > 0)!;
    const before = customer.outstanding_balance;
    const payment = await createCreditPayment({ customer_id: customer.id, amount: 25000, method: 'cash' });
    expect(payment.amount).toBe(25000);
    expect(payment.method).toBe('cash');
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(before - 25000);
    // Audited and outboxed as a payments event.
    const outbox = await db.localOutbox.toArray();
    expect(outbox.some(e => e.table === 'payments' && (e.record as { amount: number }).amount === 25000)).toBe(true);
  });

  it('records an opening balance event so recompute reproduces seeded debt', async () => {
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    if (customer.outstanding_balance === 0) return; // walk-in and clear customers don't participate
    await recomputeDerivedState();
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(customer.outstanding_balance);
  });
});

describe('v7 envelope: events reproduce the materialized state', () => {
  it('sale → return → void: stock/balance direct writes match the recompute', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    const stockBefore = product.stock_quantity;
    const balanceBefore = customer.outstanding_balance;

    const saleId = await processLocalSale(
      STORE_ID, customer.id, 'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 4, unit_price: 100, total_line: 400 }],
      400,
    );
    const ret = await createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 1, reason: 'x', return_type: 'refund', notes: '' });
    await updateLocalReturnStatus(ret.id, 'completed');
    await voidLocalSale(saleId, 'test void', null);

    // Direct path ended exactly where we started voiding (net restock).
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(stockBefore);
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(balanceBefore);

    // The corpus backend agrees, minus the void adjustment event.
    const adjustments = await db.localAdjustments.toArray();
    expect(adjustments.some(a => a.reason === 'void' && a.delta === 3)).toBe(true);

    const recompute = await recomputeDerivedState();
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(stockBefore);
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(balanceBefore);
    expect(recompute.changed_products).toBe(0);
    expect(recompute.changed_customers).toBe(0);
  });

  it('void after a payment leaves the balance negative — the shop owes the customer', async () => {
    const product = (await db.localProducts.toArray())[0];
    // A fresh customer has an event-clean balance of exactly 0 — the direct
    // path and the corpus can only disagree via the tested semantics.
    const customerId = crypto.randomUUID();
    await createSyncedRecord('customers', {
      id: customerId, name: 'Partial Payer', phone: '0700000000',
      credit_limit: 100000, outstanding_balance: 0, created_at: new Date().toISOString(),
    });
    const saleId = await processLocalSale(
      STORE_ID, customerId, 'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 50000, total_line: 50000 }],
      50000,
    );
    await createCreditPayment({ customer_id: customerId, amount: 20000 });
    await voidLocalSale(saleId, 'voided after partial payment', null);

    // 500 owed − 200 already paid − 500 sale reversed = shop owes 200.
    const after = (await db.localCustomers.get(customerId))!.outstanding_balance;
    expect(after).toBe(-20000);
    // ...and the event corpus agrees (no clamp hiding the money).
    await recomputeDerivedState();
    expect((await db.localCustomers.get(customerId))!.outstanding_balance).toBe(-20000);
  });

  it('a remote adjustment event moves derived stock and can flag sold-through', async () => {
    const product = (await db.localProducts.toArray())[0];
    const overSell = product.stock_quantity + 10;
    await applyPullPage(
      [
        {
          seq: 1,
          table: 'adjustments',
          record: {
            id: crypto.randomUUID(), table_name_rc: undefined,
            product_id: product.id, delta: -overSell, reason: 'stocktake', note: 'other till sold through',
            device_id: REMOTE_DEVICE, device_seq: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
          } as unknown as Parameters<typeof applyPullPage>[0][number]['record'],
        },
      ],
      0,
      1,
    );
    const after = (await db.localProducts.get(product.id))!.stock_quantity;
    expect(after).toBe(product.stock_quantity - overSell);
    expect(after).toBeLessThan(0);
    // Sold-through is flagged to audit exactly once, never silently hidden.
    const audits = await db.localAudit.where('action').equals('stock_sold_through').toArray();
    expect(audits.some(a => a.record_id === product.id)).toBe(true);
  });
});

describe('pull apply: LWW and tombstones (ADR-002 §3, §6)', () => {
  it('applies a newer profile edit, ignores an older one, and logs overrides', async () => {
    const product = (await db.localProducts.toArray())[0];
    const oldUpdatedAt = product.updated_at;

    // Newer remote edit wins.
    const newer = { ...product, name: 'Remote Rename', device_id: REMOTE_DEVICE, updated_at: new Date(new Date(oldUpdatedAt).getTime() + 1000).toISOString() };
    await applyPullPage([{ seq: 1, table: 'products', record: newer }], 0, 1);
    let row = (await db.localProducts.get(product.id))!;
    expect(row.name).toBe('Remote Rename');
    expect(row.stock_quantity).toBe(product.stock_quantity); // derived field untouched

    // OLDER remote edit is ignored.
    const older = { ...newer, name: 'Stale Remote', updated_at: oldUpdatedAt };
    await applyPullPage([{ seq: 2, table: 'products', record: older }], 1, 2);
    row = (await db.localProducts.get(product.id))!;
    expect(row.name).toBe('Remote Rename');
  });

  it('a tombstone wins against older edits; later edits stay suppressed and logged', async () => {
    const product = (await db.localProducts.toArray())[0];
    const t0 = new Date();
    const tombstoneAt = new Date(t0.getTime() + 1000).toISOString();

    await applyPullPage(
      [{ seq: 1, table: 'products', record: { ...product, name: 'Delete Me', device_id: REMOTE_DEVICE, updated_at: tombstoneAt, deleted_at: tombstoneAt } }],
      0, 1,
    );
    expect((await db.localProducts.get(product.id))!.deleted_at).toBe(tombstoneAt);

    // A later, live edit from the remote side must NOT resurrect the row.
    const resisted = { ...product, name: 'Resurrection', device_id: REMOTE_DEVICE, updated_at: new Date(t0.getTime() + 2000).toISOString(), deleted_at: null };
    await applyPullPage([{ seq: 2, table: 'products', record: resisted }], 1, 2);
    const row = (await db.localProducts.get(product.id))!;
    expect(row.deleted_at).toBe(tombstoneAt); // stays deleted
    expect(row.name).not.toBe('Resurrection');
    const suppressed = await db.localAudit.where('action').equals('sync_tombstone_suppressed').toArray();
    expect(suppressed.some(a => a.record_id === product.id)).toBe(true);
  });

  it('applies foreign sales once and their items into the embedded sale row', async () => {
    const now = new Date().toISOString();
    const saleId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    await applyPullPage(
      [
        {
          seq: 1, table: 'sales',
          record: {
            id: saleId, customer_id: null, total_amount: 12345, payment_method: 'cash',
            mpesa_reference: null, receipt_number: 77, status: 'completed', timestamp: now, store_id: STORE_ID,
            device_id: REMOTE_DEVICE, device_seq: 900, created_at: now, updated_at: now, deleted_at: null,
          },
        },
        {
          seq: 2, table: 'sale_items',
          record: { id: itemId, sale_id: saleId, product_id: '1', product_name: 'Dairy Meal 70kg', quantity: 1, unit_price: 12345, total_line: 12345, item_seq: 1, device_id: REMOTE_DEVICE },
        },
      ],
      0, 2,
    );
    const sale = (await db.localSales.get(saleId))!;
    expect(sale).toBeDefined();
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].id).toBe(itemId);
    // The watermark only advances after the whole page applied.
    expect((await db.localMeta.get(SYNC_PULL_SEQ_KEY))!.value).toBe(2);
    // Replay is a no-op (a new receipt row isn't created; stock doesn't double-move).
    await applyPullPage(
      [
        { seq: 1, table: 'sales', record: { id: saleId, customer_id: null, total_amount: 12345, payment_method: 'cash', mpesa_reference: null, receipt_number: 77, status: 'completed', timestamp: now, store_id: STORE_ID, device_id: REMOTE_DEVICE, device_seq: 900, created_at: now, updated_at: now, deleted_at: null } },
      ],
      2, 2,
    );
    expect((await db.localSales.get(saleId))!.items).toHaveLength(1);
  });
});

describe('push: outbox drains in device_seq order', () => {
  it('pushes the wire rows, then evicts on ack', async () => {
    const product = (await db.localProducts.toArray())[0];
    await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
      product.selling_price,
    );
    await createStockAdjustment({ product_id: product.id, delta: 5, reason: 'stocktake', note: 'physical count' });
    configureSync('http://sync.test', 'wk_test_token');

    const posts: { url: string; body: { records: Record<string, unknown[]> }; headers: Record<string, string> }[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      posts.push({ url: String(input), body, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({ ok: true, acked_through: 900 }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pushed = await pushOnce();
    expect(pushed).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
    const payload = posts[0].body.records;
    // Core tables present (plus whatever seeded rows are pending in this fixture).
    for (const table of ['adjustments', 'audit_events', 'sale_items', 'sales']) {
      expect(Object.keys(payload)).toContain(table);
    }
    expect(payload.sales[0]).toHaveProperty('device_seq');
    expect(payload.adjustments[0]).toHaveProperty('reason', 'stocktake');
    expect(posts[0].headers['x-device-token']).toBe('wk_test_token');

    // The outbox evicted everything the server acked up to.
    expect(await db.localOutbox.where('seq').above(900).count()).toBe(0);
    expect((await db.localMeta.get(SYNC_PUSH_ACK_KEY))!.value).toBe(900);
  });

  it('heals a stale ack from the server 409 and never renumbers', async () => {
    configureSync('http://sync.test', 'wk_test_token');
    // Deterministic window: keep ONLY the two simulated pending rows. The
    // device counter continues from the seed so no renumbering can occur.
    await db.localOutbox.clear();
    await db.localMeta.put({ key: SYNC_PUSH_ACK_KEY, value: 3 });
    const seqs = [10, 11];
    for (const seq of seqs) {
      await db.localOutbox.put({
        seq,
        table: 'audit_events',
        record: toAuditWire(seq),
      });
    }
    let call = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      const body = JSON.parse(String(init?.body));
      if (call === 1) {
        expect(body.records.audit_events[0].device_seq).toBe(10);
        return new Response(JSON.stringify({ ok: false, error: 'Device sequence gap: got 10, expected 4' }), { status: 409 });
      }
      expect(body.records.audit_events[0].device_seq).toBe(10);
      return new Response(JSON.stringify({ ok: true, acked_through: 11 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pushed = await pushOnce();
    expect(pushed).toBe(2);
    expect((await db.localMeta.get(SYNC_PUSH_ACK_KEY))!.value).toBe(11);
    // The device's monotonic counter is untouched — no silent renumbering.
    const counter = (await db.localMeta.get(DEVICE_SEQ_KEY))?.value ?? 0;
    expect(counter).toBeGreaterThanOrEqual(seqs[seqs.length - 1]);
  });
});

function toAuditWire(seq: number): Record<string, unknown> {
  return {
    id: crypto.randomUUID(), device_seq: seq,
    action: 'audit_test', table_name: 'tests', record_id: null,
    user_id: null, old_values: null, new_values: null,
  };
}
