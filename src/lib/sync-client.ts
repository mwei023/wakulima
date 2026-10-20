import {
  db,
  SYNC_PUSH_ACK_KEY,
  SYNC_PULL_SEQ_KEY,
  setMutationNotifier,
  recomputeDerivedState,
  addAudit,
} from './db';
import { STORE_ID } from '@/lib/backend';
import type { Product, Customer, Sale, CreditPayment, StockAdjustment } from '@/types';
import type { LocalReturn } from './db';

/** Rows in transit between IndexedDB and the sync wire; the server validates the column set. */
type SyncRow = Record<string, unknown>;

/**
 * Till-side sync client (ADR-002 §4). The Dexie DB remains the sole source of
 * truth; this loop converges it with the fleet. Errors are NEVER thrown into
 * the sale path — every caller catches, logs, and the next trigger retries.
 *
 * The server owns device identity (tokens mint once) and stamps pushed rows
 * with its own device uuid; our local rows carry it from pulled records.
 */

const SYNC_URL_KEY = 'wakulima-sync-url';
const SYNC_TOKEN_KEY = 'wakulima-sync-token';

export interface SyncConfig {
  url: string;
  token: string;
}

export function getSyncConfig(): SyncConfig | null {
  try {
    const url = localStorage.getItem(SYNC_URL_KEY);
    const token = localStorage.getItem(SYNC_TOKEN_KEY);
    if (url && token) return { url, token };
  } catch {
    // storage unavailable — sync stays disabled
  }
  return null;
}

export function configureSync(url: string, token: string): void {
  localStorage.setItem(SYNC_URL_KEY, url.trim());
  localStorage.setItem(SYNC_TOKEN_KEY, token.trim());
}

export function clearSyncConfig(): void {
  localStorage.removeItem(SYNC_URL_KEY);
  localStorage.removeItem(SYNC_TOKEN_KEY);
}

export type SyncState = 'unconfigured' | 'idle' | 'syncing' | 'ok' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  lastError: string | null;
  lastAckedSeq: number;
  lastPullSeq: number;
}

let status: SyncStatus = { state: 'unconfigured', lastSyncAt: null, lastError: null, lastAckedSeq: 0, lastPullSeq: 0 };
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  statusListeners.forEach(l => l());
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  void refreshWatermarks();
  return () => {
    statusListeners.delete(fn);
  };
}

async function refreshWatermarks(): Promise<void> {
  try {
    const ack = (await db.localMeta.get(SYNC_PUSH_ACK_KEY))?.value ?? 0;
    const pull = (await db.localMeta.get(SYNC_PULL_SEQ_KEY))?.value ?? 0;
    setStatus({ lastAckedSeq: ack, lastPullSeq: pull, state: getSyncConfig() ? status.state : 'unconfigured' });
  } catch {
    // ignore
  }
}

// ======================================================================
// Wire → local row maps (server columns ⇢ client rows)
// ======================================================================

function mapProduct(rec: SyncRow, existing?: Product): Product {
  return {
    id: rec.id,
    name: rec.name,
    category: rec.category,
    unit: rec.unit,
    selling_price: rec.selling_price,
    cost_price: rec.cost_price,
    // derived: incoming rows never carry stock; new products start at opening.
    stock_quantity: existing?.stock_quantity ?? rec.opening_stock ?? 0,
    reorder_level: rec.reorder_level ?? 0,
    barcode: rec.barcode ?? undefined,
    store_id: rec.store_id ?? STORE_ID,
    created_at: rec.created_at,
    updated_at: rec.updated_at ?? rec.created_at,
    opening_stock: rec.opening_stock ?? 0,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
    deleted_at: rec.deleted_at ?? null,
  };
}

function mapCustomer(rec: SyncRow, existing?: Customer): Customer {
  return {
    id: rec.id,
    name: rec.name,
    phone: rec.phone ?? '',
    credit_limit: rec.credit_limit,
    // derived: recompute fills it after the batch; start conservatively at 0.
    outstanding_balance: existing?.outstanding_balance ?? 0,
    created_at: rec.created_at,
    updated_at: rec.updated_at ?? rec.created_at,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
    deleted_at: rec.deleted_at ?? null,
  };
}

function mapSale(rec: SyncRow, existing?: Sale): Sale {
  return {
    id: rec.id,
    customer_id: rec.customer_id ?? null,
    total_amount: rec.total_amount,
    payment_method: rec.payment_method,
    mpesa_reference: rec.mpesa_reference ?? undefined,
    receipt_number: rec.receipt_number,
    status: rec.status === 'voided' ? 'voided' : 'completed',
    timestamp: rec.timestamp,
    store_id: rec.store_id ?? STORE_ID,
    items: existing?.items ?? [],
    updated_at: rec.updated_at,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
    deleted_at: rec.deleted_at ?? null,
  };
}

function mapSaleItem(rec: SyncRow): Sale['items'][number] {
  return {
    id: rec.id,
    sale_id: rec.sale_id,
    product_id: rec.product_id,
    product_name: rec.product_name,
    quantity: rec.quantity,
    unit_price: rec.unit_price,
    total_line: rec.total_line,
    item_seq: rec.item_seq ?? 1,
  };
}

function mapReturn(rec: SyncRow, existing?: LocalReturn): LocalReturn {
  return {
    id: rec.id,
    sale_id: rec.sale_id,
    product_id: rec.product_id,
    quantity: rec.quantity,
    reason: rec.reason ?? '',
    return_type: rec.return_type,
    refund_amount: rec.refund_amount,
    status: rec.status,
    notes: rec.notes ?? '',
    created_at: rec.created_at,
    completed_at: rec.completed_at ?? null,
    updated_at: rec.updated_at,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
    deleted_at: rec.deleted_at ?? null,
  };
}

function mapPayment(rec: SyncRow): CreditPayment {
  return {
    id: rec.id,
    customer_id: rec.customer_id,
    amount: rec.amount,
    method: rec.method,
    note: rec.note ?? '',
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
    deleted_at: rec.deleted_at ?? null,
  };
}

function mapAdjustment(rec: SyncRow): StockAdjustment {
  return {
    id: rec.id,
    product_id: rec.product_id,
    delta: rec.delta,
    reason: rec.reason,
    note: rec.note ?? '',
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
    deleted_at: rec.deleted_at ?? null,
  };
}

function mapAudit(rec: SyncRow) {
  return {
    id: rec.id,
    user_id: rec.user_id ?? null,
    action: rec.action,
    table_name: rec.table_name,
    record_id: rec.record_id ?? null,
    old_values: rec.old_values ?? undefined,
    new_values: rec.new_values ?? undefined,
    created_at: rec.created_at,
    device_id: rec.device_id,
    device_seq: rec.device_seq,
  };
}

// ======================================================================
// LWW helpers (ADR-002 §3): newest (updated_at, device_id) wins.
// ======================================================================

function stampOf(row: SyncRow): [string, string] {
  return [String(row.updated_at ?? row.created_at ?? row.timestamp ?? ''), String(row.device_id ?? '')];
}

/** True when wire `rec` beats the local `row` under LWW. */
function isNewer(rec: SyncRow, row: SyncRow): boolean {
  const [rAt, rDev] = stampOf(rec);
  const [lAt, lDev] = stampOf(row);
  if (rAt !== lAt) return rAt > lAt;
  return rDev > lDev;
}

// ======================================================================
// Pull: apply foreign rows, advance the watermark, flag sold-through
// ======================================================================

export interface SyncEvent {
  seq: number;
  table: string;
  record: SyncRow;
}

async function applyProfile(
  table: 'products' | 'customers',
  rec: SyncRow,
): Promise<void> {
  const main = table === 'products' ? db.localProducts : db.localCustomers;
  const local = (await main.get(rec.id)) as Product | Customer | undefined;
  if (local) {
    if (!isNewer(rec, local as SyncRow)) return;
    // An edit losing to a tombstone stays suppressed (ADR §6) and is logged.
    if ((local as SyncRow).deleted_at && !rec.deleted_at) {
      await addAudit('sync_tombstone_suppressed', table, rec.id, {
        from_device: rec.device_id, received_at: new Date().toISOString(),
      });
      return;
    }
    const mapped = table === 'products'
      ? mapProduct(rec, local as Product)
      : mapCustomer(rec, local as Customer);
    await main.put(mapped);
    await addAudit('sync_lww_override', table, rec.id, {
      by_device_id: rec.device_id, received_at: rec.updated_at ?? rec.created_at,
    }, null, { name: (local as SyncRow).name });
    return;
  }
  const mapped = table === 'products' ? mapProduct(rec) : mapCustomer(rec);
  await main.put(mapped);
}

async function applySaleVersion(rec: SyncRow): Promise<void> {
  const local = await db.localSales.get(rec.id);
  if (local && !isNewer(rec, local)) return; // our newer void/edit stands
  const mapped = mapSale(rec, local ?? undefined);
  await db.localSales.put(mapped);
  if (rec.deleted_at) {
    await addAudit('sync_sale_tombstone', 'sales', rec.id, { by_device_id: rec.device_id });
  }
}

async function applySaleItem(rec: SyncRow): Promise<void> {
  const sale = await db.localSales.get(rec.sale_id);
  if (!sale) return; // the sale version necessarily precedes its items in log order
  if (sale.items.some(i => i.id === rec.id)) return; // idempotent replay
  await db.localSales.put({ ...sale, items: [...sale.items, mapSaleItem(rec)] });
}

async function applyReturnVersion(rec: SyncRow): Promise<void> {
  const local = await db.localReturns.get(rec.id);
  if (local && !isNewer(rec, local)) return;
  await db.localReturns.put(mapReturn(rec));
}

async function applyAdditive(
  table: 'payments' | 'adjustments' | 'audit_events',
  rec: SyncRow,
): Promise<void> {
  switch (table) {
    case 'payments': {
      if (await db.localPayments.get(rec.id)) return;
      await db.localPayments.put(mapPayment(rec));
      return;
    }
    case 'adjustments': {
      if (await db.localAdjustments.get(rec.id)) return;
      await db.localAdjustments.put(mapAdjustment(rec));
      return;
    }
    case 'audit_events': {
      if (await db.localAudit.get(rec.id)) return;
      await db.localAudit.put(mapAudit(rec));
      return;
    }
  }
}

export async function applyPullPage(events: SyncEvent[], watermarkBefore: number, sinceNext: number): Promise<void> {
  await db.transaction(
    'rw',
    // localOutbox joins because the override/suppression/sold-through audit
    // entries this apply produces are themselves synced rows.
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localPayments, db.localAdjustments, db.localAudit, db.localOutbox, db.localMeta],
    async () => {
      for (const ev of events) {
        if (ev.seq <= watermarkBefore) continue; // replay guard
        const rec = ev.record;
        switch (ev.table) {
          case 'products': await applyProfile('products', rec); break;
          case 'customers': await applyProfile('customers', rec); break;
          case 'sales': await applySaleVersion(rec); break;
          case 'sale_items': await applySaleItem(rec); break;
          case 'returns': await applyReturnVersion(rec); break;
          case 'payments': await applyAdditive('payments', rec); break;
          case 'adjustments': await applyAdditive('adjustments', rec); break;
          case 'audit_events': await applyAdditive('audit_events', rec); break;
          default: break; // unknown table: log and keep the watermark moving
        }
      }
      // Recompute stock/balance over the merged event corpus — this is where
      // another till's sales/adjustments/payments actually move our numbers.
      const { sold_through, over_limit } = await recomputeDerivedState();
      for (const productId of sold_through) {
        const already = (await db.localAudit.where('action').equals('stock_sold_through').toArray())
          .some(a => a.record_id === productId);
        if (already) continue;
        await addAudit('stock_sold_through', 'products', productId, {
          at: new Date().toISOString(), note: 'computed stock below zero; physical count → adjustment event required (ADR-002 §3.2)',
        });
      }
      // Credit over-commit is reachable ONLY via merges (each till refuses
      // over-limit sales locally, ADR-002 §6) — flag it where it materializes.
      for (const customerId of over_limit) {
        const already = (await db.localAudit.where('action').equals('credit_over_committed').toArray())
          .some(a => a.record_id === customerId);
        if (already) continue;
        await addAudit('credit_over_committed', 'customers', customerId, {
          at: new Date().toISOString(), note: 'merged balance exceeds credit limit; collect the debt (ADR-002 §6)',
        });
      }
      // The watermark advances ONLY after every apply in this transaction.
      await db.localMeta.put({ key: SYNC_PULL_SEQ_KEY, value: sinceNext });
    },
  );
}

export async function pullOnce(): Promise<number> {
  const cfg = getSyncConfig();
  if (!cfg) throw new Error('sync not configured');
  const base = cfg.url.replace(/\/+$/, '');
  let watermark = (await db.localMeta.get(SYNC_PULL_SEQ_KEY))?.value ?? 0;
  let pulled = 0;
  for (;;) {
    const res = await fetch(`${base}/sync/pull?since=${watermark}`, { headers: { 'x-device-token': cfg.token } });
    if (res.status === 401) throw new Error('sync pull rejected: bad device token');
    if (!res.ok) throw new Error(`sync pull failed (${res.status})`);
    const data = (await res.json()) as { events: SyncEvent[]; since_next: number; drained: boolean };
    const events = data.events ?? [];
    if (events.length === 0) break;
    await applyPullPage(events, watermark, data.since_next);
    watermark = data.since_next;
    pulled += events.length;
    if (data.drained) break;
  }
  setStatus({ lastPullSeq: watermark });
  await refreshWatermarks();
  return pulled;
}

// ======================================================================
// Push: drain the outbox in device_seq order; heal a stale ack from 409s
// ======================================================================

export async function pushOnce(): Promise<number> {
  const cfg = getSyncConfig();
  if (!cfg) throw new Error('sync not configured');
  const base = cfg.url.replace(/\/+$/, '');
  let ack = (await db.localMeta.get(SYNC_PUSH_ACK_KEY))?.value ?? 0;

  // A stale local ack (crash between server commit and local save, or a
  // restored meta) is healed from the moveToErr message:
  //   "Device sequence gap: got <got>, expected <expected>" → ack = expected-1.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pending = await db.localOutbox.where('seq').above(ack).sortBy('seq');
    if (pending.length === 0) return 0;
    const records: Record<string, Record<string, unknown>[]> = {};
    for (const entry of pending) {
      (records[entry.table] ??= []).push(entry.record);
      if (entry.children) (records[entry.children.table] ??= []).push(...entry.children.records);
    }
    const res = await fetch(`${base}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-token': cfg.token },
      body: JSON.stringify({ records }),
    });
    if (res.status === 401) throw new Error('sync push rejected: bad device token');
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const match = /expected (\d+)/.exec(body?.error ?? '');
      if (match) {
        // Server has rows we no longer hold — trust ITS ack and remove the
        // replayed set. Never renumbers: the server watermark stays mono.
        ack = Number(match[1]) - 1;
        await db.localMeta.put({ key: SYNC_PUSH_ACK_KEY, value: ack });
        continue; // retry with the corrected window
      }
      throw new Error(`sync push rejected: ${body?.error ?? 'sequence gap'}`);
    }
    if (!res.ok) throw new Error(`sync push failed (${res.status})`);
    const data = (await res.json()) as { acked_through?: number };
    const acked = data.acked_through ?? ack;
    if (acked > ack) {
      ack = acked;
      await db.localMeta.put({ key: SYNC_PUSH_ACK_KEY, value: ack });
    }
    // Evict only what the server provably holds; acks are at-least-once safe.
    await db.localOutbox.where('seq').belowOrEqual(ack).delete();
    setStatus({ lastAckedSeq: ack });
    return pending.length;
  }
  throw new Error('sync push rejected: unresolved sequence gap');
}

// ======================================================================
// The loop (ADR-002 §4 triggers): pull-before-push, never blocking
// ======================================================================

let inFlight = false;

export async function syncOnce(): Promise<{ pulled: number; pushed: number }> {
  if (!getSyncConfig()) throw new Error('sync not configured');
  if (inFlight) return { pulled: 0, pushed: 0 };
  inFlight = true;
  setStatus({ state: 'syncing' });
  try {
    const pulled = await pullOnce();
    const pushed = await pushOnce();
    setStatus({ state: 'ok', lastSyncAt: new Date().toISOString(), lastError: null });
    void refreshWatermarks();
    return { pulled, pushed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ state: 'error', lastError: message });
    try {
      await addAudit('sync_failed', 'localMeta', null, { error: message, at: new Date().toISOString() });
    } catch {
      // auditing failures never mask the sync failure (§1)
    }
    throw error;
  } finally {
    inFlight = false;
  }
}

let mutationTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function scheduleMutationSync(): void {
  if (!getSyncConfig() || !started) return;
  if (mutationTimer) clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    mutationTimer = null;
    void syncOnce().catch(() => { /* logged in syncOnce */ });
  }, 5000);
}

export function startAutoSync(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  setMutationNotifier(scheduleMutationSync);

  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void syncOnce().catch(() => { /* logged */ });
  };
  const interval = window.setInterval(tick, 30_000);
  const onOnline = () => tick();
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    started = false;
    setMutationNotifier(null);
    window.clearInterval(interval);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export async function runSyncNow(): Promise<{ pulled: number; pushed: number }> {
  return syncOnce();
}
