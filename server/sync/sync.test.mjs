import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { exec, execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { startSyncServer } from './sync-server.mjs';

// The sync API contract, tested against a REAL Postgres (ADR-002):
// continuity-checked idempotent push, per-table watermark pull that hides
// your own writes, tombstones, and money that survives the bigint trip.
// Postgres source: DATABASE_URL (CI service) or an ephemeral docker
// container (this machine). Neither → tests skip loudly rather than lie.

const CI_URL = process.env.DATABASE_URL ?? null;

// Evaluated synchronously so `it.skipIf` can gate every case on a REAL
// answer — never on an env var nobody
const hasDocker = (() => {
  try { execSync('docker --version', { stdio: 'ignore' }); return true; } catch { return false; }
})();
const canRun = !!CI_URL || hasDocker;

let ctx; // { server, pool, port }
let containerId = null;
const adminToken = 'test-admin';

async function waitForDb(pool, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { await pool.query('select 1'); return; } catch { /* keep waiting */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Postgres never became ready');
}

beforeAll(async () => {
  let dbUrl;
  if (CI_URL) {
    dbUrl = CI_URL;
    console.log('sync tests using CI Postgres');
  } else {
    const hasDocker = await new Promise(resolve => {
      exec('docker --version', err => resolve(!err));
    });
    if (!hasDocker) {
      console.log('SKIP env: no DATABASE_URL and no docker — sync API tests skipped');
      ctx = null;
      return;
    }
    containerId = execSync(
      'docker run --rm -d -P -e POSTGRES_PASSWORD=wakulima -e POSTGRES_USER=wakulima -e POSTGRES_DB=wakulima postgres:16-alpine',
      { encoding: 'utf8' }
    ).trim();
    const portLine = execSync(`docker port ${containerId} 5432/tcp`, { encoding: 'utf8' });
    const hostPort = Number(portLine.trim().split('\n')[0].split(':')[1]);
    dbUrl = `postgres://wakulima:wakulima@127.0.0.1:${hostPort}/wakulima`;
    console.log('sync tests using ephemeral docker Postgres on port', hostPort);
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: dbUrl });
  await waitForDb(pool);
  // import.meta.url is a virtual URL under vitest's transform — use the
  // cwd-relative path (vitest always runs from the project root).
  const schema = await fs.readFile(path.resolve(process.cwd(), 'server/sync/schema.sql'), 'utf8');
  await pool.query(schema); // simple-query protocol runs the whole file

  // Fresh isolation for every test run: wipe everything after schema setup.
  await pool.query('truncate devices, products, customers, sales, sale_items, returns, payments, adjustments, audit_events');

  process.env.ADMIN_TOKEN = adminToken;
  const started = await startSyncServer({ pool, port: 0 });
  ctx = { ...started, baseUrl: `http://127.0.0.1:${started.port}` };
}, 120_000);

afterAll(async () => {
  if (ctx) await new Promise(r => ctx.server.close(r));
  if (containerId) exec(`docker kill ${containerId}`);
});

const post = (path, body, headers = {}) =>
  fetch(`${ctx?.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }));

const pull = (path, headers = {}) =>
  fetch(`${ctx?.baseUrl}${path}`, { headers }).then(async r => ({ status: r.status, body: await r.json() }));

const envelope = (seq, extra = {}) => ({
  // extra first: the envelope owns the identity fields (a nested payload
  // carrying its own device_seq must not override the intended one — that
  // silent override was exactly the ""tombstone never arrived"" bug).
  ...extra,
  device_seq: seq,
  created_at: extra.created_at ?? '2026-10-18T10:00:00.000Z',
  updated_at: extra.updated_at ?? '2026-10-18T10:00:00.000Z',
  deleted_at: 'deleted_at' in extra ? extra.deleted_at : null,
});

async function mintDevice(name) {
  const res = await post('/devices', { name }, { 'x-admin-token': adminToken });
  expect(res.status).toBe(201);
  return { id: res.body.device.id, token: res.body.token };
}

const pushHeaders = t => ({ 'x-device-token': t });

describe('sync API against real Postgres', () => {
  it.skipIf(!canRun)('answers healthz', async () => {
    if (!ctx) return;
    const res = await fetch(`${ctx.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it.skipIf(!canRun)('rejects device minting with a wrong admin token', async () => {
    if (!ctx) return;
    const res = await post('/devices', { name: 'rogue' }, { 'x-admin-token': 'wrong' });
    expect(res.status).toBe(403);
  });

  it.skipIf(!canRun)('mints a device token that is shown once and authenticates pushes', async () => {
    if (!ctx) return;
    const device = await mintDevice('till-1');
    expect(device).toMatchObject({ id: expect.any(String), token: expect.stringMatching(/^wk_/) });

    const rows = [
      envelope(1, {
        id: '11111111-1111-4111-8111-111111111111',
        opening_stock: 10,
        name: 'Dairy Meal 70kg',
        category: 'Feed',
        unit: 'bag',
        selling_price: 350000,
        cost_price: 320000,
        reorder_level: 5,
        barcode: null,
      }),
      envelope(2, {
        id: '11111111-1111-4111-8111-111111111112',
        opening_stock: 3,
        name: 'AC Dip 1L',
        category: 'Vet',
        unit: 'bottle',
        selling_price: 120000,
        cost_price: 95000,
        reorder_level: 2,
        barcode: 'BEEP',
      }),
    ];
    const badPush = await post('/sync/push', { records: { products: rows } }, { 'x-device-token': 'nope' });
    expect(badPush.status).toBe(401);

    const push1 = await post('/sync/push', { records: { products: rows } }, pushHeaders(device.token));
    expect(push1.status).toBe(200);
    expect(push1.body).toMatchObject({ ok: true, acked_through: 2 });

    // Idempotent replay: same rows again — nothing changes.
    const push2 = await post('/sync/push', { records: { products: rows } }, pushHeaders(device.token));
    expect(push2.body).toMatchObject({ ok: true, acked_through: 2 });

    // Continuity: seq 4 arriving when 2 is the watermark is a breach → 409.
    const gapped = await post('/sync/push', {
      records: { products: [envelope(4, { id: '11111111-1111-4111-8111-111111111114', opening_stock: 1, name: 'jirooke', category: 'x', unit: 'x', selling_price: 100, cost_price: 90, reorder_level: 0, barcode: null })] },
    }, pushHeaders(device.token));
    expect(gapped.status).toBe(409);
  });

  it.skipIf(!canRun)('pull returns other devices rows, hides own, advances watermarks to drained', async () => {
    if (!ctx) return;
    const till1 = await mintDevice('pull-a');
    const till2 = await mintDevice('pull-b');

    const saleSeq = 1;
    const sale = envelope(saleSeq, {
      id: '22222222-2222-4222-8222-222222222221',
      customer_id: null,
      total_amount: 700000,
      payment_method: 'mpesa',
      mpesa_reference: 'SD8F7D',
      receipt_number: 1,
      status: 'completed',
      timestamp: '2026-10-18T10:01:00.000Z',
      store_id: 'main-store',
    });
    const items = [
      {
        id: '33333333-3333-4333-8333-333333333331',
        sale_id: sale.id,
        product_id: '11111111-1111-4111-8111-111111111111',
        product_name: 'Dairy Meal 70kg',
        quantity: 2,
        unit_price: 350000,
        total_line: 700000,
        item_seq: 1,
      },
    ];
    const push = await post('/sync/push', { records: { sales: [sale], sale_items: items } }, pushHeaders(till1.token));
    expect(push.status).toBe(200);
    expect(push.body).toMatchObject({ ok: true, acked_through: saleSeq });

    // Shared server state across tests: count deltas, never absolutes.
    const pre = await pull('/sync/pull?since=0', pushHeaders(till2.token));
    const preProducts = pre.body.events.filter(e => e.table === 'products').length;

    // till2 pulls: sees till1's rows with bigint cents as exact numbers.
    let pull1 = await pull('/sync/pull?since=0', pushHeaders(till2.token));
    expect(pull1.status).toBe(200);
    const seenSales = pull1.body.events.filter(e => e.table === 'sales' && e.record.id === sale.id);
    expect(seenSales).toHaveLength(1);
    expect(seenSales[0].record.total_amount).toBe(700000);
    expect(Number.isInteger(seenSales[0].record.total_amount)).toBe(true);
    const seenItems = pull1.body.events.filter(e => e.table === 'sale_items' && e.record.sale_id === sale.id);
    expect(seenItems).toHaveLength(1);
    expect(seenItems[0].record.unit_price).toBe(350000);
    // This test pushes no products; the product event count is unchanged.
    expect(pull1.body.events.filter(e => e.table === 'products').length).toBe(preProducts);

    // till1 must NOT see its own writes.
    let pullSelf = await pull('/sync/pull?since=0', pushHeaders(till1.token));
    expect(pullSelf.body.events.filter(e => e.record.device_id === till1.id)).toHaveLength(0);

    // Advance till2's watermark → drained.
    const pull2 = await pull(`/sync/pull?since=${pull1.body.since_next}`, pushHeaders(till2.token));
    expect(pull2.body.events).toHaveLength(0);
    expect(pull2.body.drained).toBe(true);
  });

  it.skipIf(!canRun)('tombstones travel as rows and LWW envelope carries deleted_at', async () => {
    if (!ctx) return;
    const till1 = await mintDevice('tomb-a');
    const till2 = await mintDevice('tomb-b');
    const pid = '44444444-4444-4444-8444-444444444441';
    const product = envelope(1, {
      id: pid,
      opening_stock: 5,
      name: 'Discontinued spray',
      category: 'Vet',
      unit: 'bottle',
      selling_price: 10000,
      cost_price: 8000,
      reorder_level: 1,
      barcode: null,
    });
    const push1 = await post('/sync/push', { records: { products: [product] } }, pushHeaders(till1.token));
    expect(push1.status).toBe(200);
    expect(push1.body).toMatchObject({ ok: true, acked_through: 1 });

    // Till1 deletes it: same row id, newer updated_at, deleted_at set (new device_seq).
    const push2 = await post('/sync/push', {
      records: { products: [envelope(2, { ...product, updated_at: '2026-10-18T11:00:00.000Z', deleted_at: '2026-10-18T11:00:00.000Z' })] },
    }, pushHeaders(till1.token));
    expect(push2.status).toBe(200);
    expect(push2.body).toMatchObject({ ok: true, acked_through: 2 });

    const res = await pull('/sync/pull?since=0', pushHeaders(till2.token));
    const events = res.body.events.filter(e => e.table === 'products' && e.record.id === pid);
    expect(events).toHaveLength(2); // create + tombstone, BOTH as log versions
    expect(events[0].record.deleted_at).toBeNull();
    expect(events[1].record.deleted_at).toBe('2026-10-18T11:00:00.000Z');
  });
});

// ======================================================================
// 2.2c — the two-till fixture drill (ADR-002 §8.3, §3.2, §6)
//
// Two REAL till clients — each its own Dexie/IndexedDB universe, its own
// storage shim and its own module-instance sync identity — run the whole
// ADR story against the REAL server and Postgres: both sell the full shelf
// offline, the merge must carry both sales, derived stock goes negative and
// is audited sold-through; the same product price is edited on two tills and
// resolved by LWW with the overrider audited; credit sales that are legal on
// each till separately over-commit the merged balance and are flagged.
// ======================================================================
const DRILL_BASE = '2026-10-19T08:00:00.000Z';
const P_ID = 'c0000000-0000-4a00-8000-000000000001';
const C_ID = 'c0000000-0000-4a00-8000-000000000002';
// A second product for the credit drill: the stock-oversell merges its way to
// −8 on both tills, so the credit story needs units that still exist there.
const P2_ID = 'c0000000-0000-4a00-8000-000000000003';
const PRODUCT = {
  id: P_ID, name: 'Chick Mash 50kg', category: 'Feed', unit: 'bag',
  selling_price: 420000, cost_price: 380000, stock_quantity: 8, reorder_level: 2,
  barcode: null, created_at: DRILL_BASE,
};
const PRODUCT2 = {
  id: P2_ID, name: 'Layers Mash 70kg', category: 'Feed', unit: 'bag',
  selling_price: 380000, cost_price: 340000, stock_quantity: 2, reorder_level: 1,
  barcode: null, created_at: DRILL_BASE,
};
const CUSTOMER = {
  id: C_ID, name: 'Grace Wanjiru', phone: '0722 000 000',
  credit_limit: 100000, outstanding_balance: 0, created_at: DRILL_BASE,
};
const SALE = { quantity: 8, unit_price: PRODUCT.selling_price, total_line: PRODUCT.selling_price * 8 };

function bootTill(name) {
  return (async () => {
    // A fresh fake-indexeddb universe per till, installed via globals BEFORE
    // the module re-import so each Dexie instance captures its own factory.
    vi.resetModules();
    const fi = await import('fake-indexeddb');
    globalThis.indexedDB = new fi.IDBFactory();
    globalThis.IDBKeyRange = fi.IDBKeyRange;
    const storage = new Map();
    globalThis.localStorage = {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
      clear: () => storage.clear(),
    };
    // Fresh module instances: the singletons inside db.ts / sync-client.ts
    // (Dexie handle, device uuid counter, sync config) all belong to ONE till.
    // Dexie is an externalized module (never re-evaluated by resetModules),
    // so its class — and its static `dependencies` captured at construction —
    // is shared across tills: repoint it at THIS till's fresh factory just
    // before db.ts evaluates and its OfflineDatabase captures the deps.
    const DexieMod = await import('dexie');
    DexieMod.Dexie.dependencies.indexedDB = globalThis.indexedDB;
    DexieMod.Dexie.dependencies.IDBKeyRange = fi.IDBKeyRange;
    const dbMod = await import('../../src/lib/db');
    const scMod = await import('../../src/lib/sync-client');
    // Mint + cache this till's device uuid NOW, while its own storage shim is
    // the global: the mint is lazy, and a first call made after another till
    // boots would land in the wrong shard. Fresh factories never run the v7
    // migration, so nothing else wakes getDeviceId at open time.
    dbMod.getDeviceId();
    // Open while this till's factory is on the globals.
    await dbMod.db.open();
    return { name, dbMod, scMod, localStorage: globalThis.localStorage };
  })();
}

function asTill(till, fn) {
  // Sequential drill: point the global storage at the till performing the
  // step (per-call reads like getSyncConfig/getDeviceId-hit route there).
  globalThis.localStorage = till.localStorage;
  return fn();
}

async function converge(order, tills) {
  for (let round = 0; round < 6; round++) {
    let quiet = true;
    for (const till of order) {
      const r = await asTill(till, () => till.scMod.syncOnce());
      if (r.pulled !== 0 || r.pushed !== 0) quiet = false;
    }
    if (quiet) return round;
  }
  throw new Error('tills never stabilized within 6 rounds');
}

describe('two-till fixture drill (ADR-002 §8.3 / 2.2c)', () => {
  let A = null;
  let B = null;
  const tills = () => [A, B];

  beforeAll(async () => {
    if (!canRun) return;
    // A pristine fleet for the drill storyline: this describe runs LAST in the
    // file, so the API tests above are done with their server state. Wipe it
    // (devices included — and mint fresh tokens) so a fresh till's bootstrap
    // pull sees nothing but the drill's own corpus, and pushed/pulled counts
    // are deterministic instead of reflecting the API tests' leftovers.
    await ctx.pool.query(
      'truncate devices, products, customers, sales, sale_items, returns, payments, adjustments, audit_events, sync_log restart identity cascade',
    );
    const [deviceA, deviceB] = [await mintDevice('drill-till-A'), await mintDevice('drill-till-B')];
    A = await bootTill('guardian-main');
    B = await bootTill('guardian-annex');
    // device ids must differ — per-till storage mints separate uuids
    expect(A.dbMod.getDeviceId()).not.toBe(B.dbMod.getDeviceId());

    // Bootstrap: till A holds the shared corpus and pushes it; till B pulls
    // it (real HTTP both ways) — the normal fleet bootstrap.
    await asTill(A, async () => {
      await A.dbMod.createSyncedRecord('products', { ...PRODUCT });
      await A.dbMod.createSyncedRecord('products', { ...PRODUCT2 });
      await A.dbMod.createSyncedRecord('customers', { ...CUSTOMER });
    });    await asTill(A, () => A.scMod.configureSync(ctx.baseUrl, deviceA.token));
    await asTill(B, () => B.scMod.configureSync(ctx.baseUrl, deviceB.token));
    const bootPush = await asTill(A, () => A.scMod.syncOnce());
    expect(bootPush.pushed).toBe(3);
    expect(bootPush.pulled).toBe(0);
    const bootPull = await asTill(B, () => B.scMod.syncOnce());
    expect(bootPull.pulled).toBe(3);
    const mirrored = await asTill(B, () => B.dbMod.db.localProducts.get(P_ID));
    expect(mirrored.stock_quantity).toBe(8);
  });

  it.skipIf(!canRun)('both tills can sell the whole shelf offline (the divergence starts)', async () => {
    if (!A) return;
    for (const till of tills()) {
      await asTill(till, async () => {
        const saleId = await till.dbMod.processLocalSale('main-store', null, 'cash', [
          { product_id: P_ID, product_name: PRODUCT.name, ...SALE },
        ], SALE.total_line);
        expect(saleId).toEqual(expect.any(String));
        const after = await till.dbMod.db.localProducts.get(P_ID);
        expect(after.stock_quantity).toBe(0); // legal locally... on BOTH tills
      });
    }
  });

  it.skipIf(!canRun)('offline divergence merges: both sales arrive and stock flags sold-through', async () => {
    if (!A) return;
    await converge(tills(), tills());

    for (const till of tills()) {
      await asTill(till, async () => {
        // Audit exactly shows both sales — mine AND the other till's — with
        // the seller attribution distinguishing them.
        const sales = await till.dbMod.db.localSales.toArray();
        expect(sales).toHaveLength(2);
        expect(new Set(sales.map(s => s.device_id)).size).toBe(2);
        for (const s of sales) expect(s.items).toHaveLength(1);

        // Derived stock over the merged corpus: 8 − 16 = −8 → flagged.
        const product = await till.dbMod.db.localProducts.get(P_ID);
        expect(product.stock_quantity).toBe(-8);
        const flags = await till.dbMod.db.localAudit.where('action').equals('stock_sold_through').toArray();
        expect(flags.some(a => a.record_id === P_ID)).toBe(true);
      });
    }

    const { rows: saleRows } = await ctx.pool.query(
      'select device_id, total_amount from sales',
    );
    const drillSales = saleRows.filter(r => Number(r.total_amount) === SALE.total_line);
    expect(drillSales).toHaveLength(2);
    expect(new Set(drillSales.map(r => String(r.device_id))).size).toBe(2);
    const { rows: itemRows } = await ctx.pool.query('select count(*)::int as n from sale_items where product_id = $1', [P_ID]);
    expect(itemRows[0].n).toBe(2);
  });

  it.skipIf(!canRun)('the same price edited on two tills resolves by LWW with the loser audited', async () => {
    if (!A) return;
    // Offline edits with deterministic clocks: A twice, B last (later sleep
    // ⇒ strictly newer updated_at ⇒ B must win on every till).
    await asTill(A, () => A.dbMod.updateSyncedRecord('products', P_ID, { selling_price: 440000 }));
    await new Promise(r => setTimeout(r, 150));
    const aFinal = await asTill(A, () => A.dbMod.updateSyncedRecord('products', P_ID, { selling_price: 450000 }));
    await new Promise(r => setTimeout(r, 150));
    const bFinal = await asTill(B, () => B.dbMod.updateSyncedRecord('products', P_ID, { selling_price: 499000 }));
    expect(bFinal.updated_at > aFinal.updated_at).toBe(true); // LWW winner is unambiguous

    await converge(tills(), tills());

    for (const till of tills()) {
      await asTill(till, async () => {
        const product = await till.dbMod.db.localProducts.get(P_ID);
        expect(product.selling_price).toBe(499000);
      });
    }
    // A hung on to its own 450000 edit until B's version arrived — the
    // override must be audited there, not silently swallowed.
    const overrides = await asTill(A, () =>
      A.dbMod.db.localAudit.where('action').equals('sync_lww_override').toArray());
    expect(overrides.filter(a => a.record_id === P_ID)).toHaveLength(1);

    // Also: the double-edit-before-first-push continuity (§6) — BOTH of A's
    // versions reached the log, no silent renumber.
    const { rows } = await ctx.pool.query(
      'select record->>\'selling_price\' as price from sync_log where table_name = $1 and record->>\'id\' = $2 order by seq',
      ['products', P_ID],
    );
    expect(rows.map(r => r.price)).toEqual(['420000', '440000', '450000', '499000']);
    const { rows: typed } = await ctx.pool.query('select selling_price from products where id = $1', [P_ID]);
    expect(Number(typed[0].selling_price)).toBe(499000); // typed final state IS the LWW winner
  });

  it.skipIf(!canRun)('credit over-commit appears only after the merge and is flagged once per till', async () => {
    if (!A) return;
    // Each till refuses over-limit credit sales locally; 60000 is legal in
    // EVERY isolated view of the 100000 limit. Only the merged corpus (120000)
    // exceeds it — exactly the §6 accepted consequence.
    for (const till of tills()) {
      await asTill(till, async () => {
        const saleId = await till.dbMod.processLocalSale('main-store', C_ID, 'credit', [
          { product_id: P2_ID, product_name: PRODUCT2.name, quantity: 1, unit_price: 60000, total_line: 60000 },
        ], 60000);
        expect(saleId).toEqual(expect.any(String));
      });
    }

    await converge(tills(), tills());

    for (const till of tills()) {
      await asTill(till, async () => {
        const customer = await till.dbMod.db.localCustomers.get(C_ID);
        expect(customer.outstanding_balance).toBe(120000); // 60000 + 60000, derived over events
        const flags = await till.dbMod.db.localAudit.where('action').equals('credit_over_committed').toArray();
        expect(flags.some(a => a.record_id === C_ID)).toBe(true);
      });
    }
  });

  it.skipIf(!canRun)('the drill stabilizes: nothing left to pull or push on either till', async () => {
    if (!A) return;
    for (const till of tills()) {
      const r = await asTill(till, () => till.scMod.syncOnce());
      expect(r).toEqual({ pulled: 0, pushed: 0 });
    }
  });
});
