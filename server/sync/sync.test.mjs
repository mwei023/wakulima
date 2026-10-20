import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
