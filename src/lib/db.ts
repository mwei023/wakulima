import Dexie, { Table } from 'dexie';
import { Product, Customer, Sale, CreditPayment, StockAdjustment } from '@/types';
import { STORE_ID } from '@/lib/backend';

/** Rows in transit between IndexedDB and the sync wire; the server validates the column set. */
type SyncRow = Record<string, unknown>;

export interface LocalReturn {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  reason: string;
  return_type: string;
  refund_amount: number;
  status: string;
  notes: string;
  created_at: string;
  completed_at?: string | null;
  updated_at?: string;
  // ---- sync envelope (ADR-002 §2; stamped on write, backfilled by v7) ----
  device_id?: string;
  device_seq?: number;
  deleted_at?: string | null;
}

export interface LocalAuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id?: string | null;
  old_values?: unknown;
  new_values?: unknown;
  created_at: string;
  // ---- sync envelope ----
  device_id?: string;
  device_seq?: number;
}

/** Key/value counter storage (receipt sequence and future cursors). */
export interface LocalMetaEntry {
  key: string;
  value: number;
}

/**
 * Outbox (ADR-002 §4/§6): every write stamps an envelope AND freezes its
 * wire representation here, keyed by the per-device monotonic device_seq.
 * Continuity is outbox-ordered, not table-scanned, so a row edited twice
 * before its first push still pushes BOTH versions (server upserts by id,
 * newer seq wins) — no gap, no silent renumber. Rows are evicted once acked.
 */
export interface LocalOutboxEntry {
  seq: number;
  table: string;
  record: Record<string, unknown>;
  children?: { table: string; records: Record<string, unknown>[] };
}

export const RECEIPT_SEQ_KEY = 'receipt_seq';
/** Monotonic per-device counter for ALL synced tables (ADR-002 §2). */
export const DEVICE_SEQ_KEY = 'device_seq';
/** Highest device_seq this device knows the server accepted (outgoing watermark). */
export const SYNC_PUSH_ACK_KEY = 'sync_push_ack';
/** Server sync_log global ingest seq this device has applied (incoming watermark). */
export const SYNC_PULL_SEQ_KEY = 'sync_pull_seq';

class OfflineDatabase extends Dexie {
  localProducts!: Table<Product, string>;
  localCustomers!: Table<Customer, string>;
  localSales!: Table<Sale, string>;
  localReturns!: Table<LocalReturn, string>;
  localAudit!: Table<LocalAuditEntry, string>;
  localPayments!: Table<CreditPayment, string>;
  localAdjustments!: Table<StockAdjustment, string>;
  localOutbox!: Table<LocalOutboxEntry, number>;
  localMeta!: Table<LocalMetaEntry, string>;

  constructor() {
    super('WakulimaAgrovetDB');
    // v2/v3/v4 existed under an earlier server-sync architecture (offlineData,
    // queuedSales, conflicts) and single-store transfers. v5 deletes those dead tables.
    this.version(2).stores({
      offlineData: '++id, lastUpdated',
      queuedSales: '++id, timestamp, synced',
      conflicts: '++id, type, timestamp, resolved'
    });
    this.version(3).stores({
      localProducts: 'id, store_id, category',
      localCustomers: 'id',
      localSales: 'id, store_id, timestamp'
    });
    this.version(4).stores({
      localReturns: 'id, sale_id, status, created_at',
      localTransfers: 'id, status, created_at',
      localAudit: 'id, created_at, table_name, action'
    });
    this.version(5).stores({
      offlineData: null,
      queuedSales: null,
      conflicts: null,
      localTransfers: null
    });
    // v6: integer-cents money everywhere + localMeta counters. Existing v5
    // databases stored KES floats — multiply once, inside the upgrade.
    this.version(6)
      .stores({
        localProducts: 'id, store_id, category',
        localCustomers: 'id',
        localSales: 'id, store_id, timestamp',
        localReturns: 'id, sale_id, status, created_at',
        localAudit: 'id, created_at, table_name, action',
        localMeta: 'key'
      })
      .upgrade(async tx => {
        const toCents = (v: unknown): number => Math.round((typeof v === 'number' && Number.isFinite(v) ? v : 0) * 100);
        const products = await tx.table('localProducts').toArray();
        for (const p of products) {
          await tx.table('localProducts').put({ ...p, selling_price: toCents(p.selling_price), cost_price: toCents(p.cost_price) });
        }
        const customers = await tx.table('localCustomers').toArray();
        for (const c of customers) {
          await tx.table('localCustomers').put({ ...c, credit_limit: toCents(c.credit_limit), outstanding_balance: toCents(c.outstanding_balance) });
        }
        const sales = await tx.table('localSales').toArray();
        for (const s of sales) {
          await tx.table('localSales').put({
            ...s,
            total_amount: toCents(s.total_amount),
            items: s.items.map(i => ({ ...i, unit_price: toCents(i.unit_price), total_line: toCents(i.total_line) }))
          });
        }
        const returns = await tx.table('localReturns').toArray();
        for (const r of returns) {
          await tx.table('localReturns').put({ ...r, refund_amount: toCents(r.refund_amount) });
        }
      });
    // v7 (ADR-002 §8 step 2): the sync envelope. Adds the credit-ledger
    // (localPayments, signed amounts), stocktake deltas (localAdjustments),
    // and the push outbox; backfills envelopes onto every existing row in a
    // deterministic order and reconciles opening stock / legacy balances into
    // events so derived recompute never mangles pre-sync money.
    this.version(7)
      .stores({
        localPayments: 'id, customer_id, created_at',
        localAdjustments: 'id, product_id, created_at',
        localOutbox: 'seq'
      })
      .upgrade(async tx => {
        const t = (name: string) => tx.table(name);
        const collect = async (name: string): Promise<SyncRow[]> => await t(name).toArray();
        const products = await collect('localProducts');
        const customers = await collect('localCustomers');
        const sales = await collect('localSales');
        const returns = await collect('localReturns');
        const audit = await collect('localAudit');

        // ---- reconcile derived fields from the legacy event corpus ----
        const soldQty = new Map<string, number>();
        for (const s of sales) {
          for (const item of s.items ?? []) soldQty.set(item.product_id, (soldQty.get(item.product_id) ?? 0) + item.quantity);
        }
        const returnedQty = new Map<string, number>();
        for (const r of returns) {
          if (r.status === 'completed') returnedQty.set(r.product_id, (returnedQty.get(r.product_id) ?? 0) + r.quantity);
        }
        for (const p of products) {
          // opening folds everything the corpus cannot see (pre-v7 void restocks,
          // legacy hand-edits): derived(stock) will now reproduce this row exactly.
          const opening = reconcileOpeningStock(p.stock_quantity, soldQty.get(p.id) ?? 0, returnedQty.get(p.id) ?? 0);
          await t('localProducts').put({ ...p, opening_stock: opening });
        }

        const deviceId = getDeviceId();
        const paymentsTable = t('localPayments');
        let seq = 0;
        const stamp = (row: SyncRow): SyncRow => {
          seq += 1;
          return { ...row, device_id: deviceId, device_seq: seq };
        };
        for (const c of customers) {
          // Legacy rows have no updated_at; LWW tie-break needs one.
          await t('localCustomers').put({ ...c, updated_at: c.updated_at ?? c.created_at });
        }
        const customersNow = await t('localCustomers').toArray();
        const legacyDerived = customerBalancesFromEvents(customersNow as Customer[], sales as Sale[], returns.map(r => ({ ...r, status: r.status })));
        for (const c of customersNow as Customer[]) {
          const derived = legacyDerived.get(c.id) ?? 0;
          const diff = c.outstanding_balance - derived;
          if (diff !== 0) {
            // Approval #2 (ADR-002 §9): hand-edits of balance become EVENTS.
            // Legacy seeded balances (e.g. mock opening debts) are not backed
            // by any sale, so they become 'opening' ledger rows — negative
            // amount = "customer took on this debt outside a sale".
            const payment: SyncRow = stamp({
              id: crypto.randomUUID(),
              customer_id: c.id,
              amount: -diff,
              method: 'opening',
              note: 'v7 migration: legacy opening balance converted to an event',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
            });
            await paymentsTable.put(payment);
            await t('localOutbox').put(outboxEntry(payment, 'payments'));
            // The event now EXPLAINS the stored balance: recompute from the
            // full corpus yields exactly the row's stored value. The stored
            // balance stays untouched — the snapshot is the truth.
          }
        }

        // ---- deterministic envelope backfill over all pre-v7 rows ----
        const bodyTables: { table: string; rows: SyncRow[]; main: string }[] = [
          { table: 'products', rows: await collect('localProducts'), main: 'localProducts' },
          { table: 'customers', rows: customersNow, main: 'localCustomers' },
          { table: 'sales', rows: sales, main: 'localSales' },
          { table: 'returns', rows: returns, main: 'localReturns' },
          { table: 'audit_events', rows: audit, main: 'localAudit' },
        ];
        const todo = bodyTables
          .flatMap(entry => entry.rows.map(row => ({ table: entry.table, row, main: entry.main })))
          .filter(entry => entry.row.device_seq === undefined || entry.row.device_id === undefined);
        todo.sort((a, b) => {
          const ka = String(a.row.created_at ?? a.row.timestamp ?? '');
          const kb = String(b.row.created_at ?? b.row.timestamp ?? '');
          if (ka !== kb) return ka < kb ? -1 : 1;
          return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
        });
        for (const entry of todo) {
          const stamped = stamp(entry.row);
          await t(entry.main).put(stamped);
          await t('localOutbox').put(outboxEntry(stamped, entry.table));
        }
        await t('localMeta').put({ key: DEVICE_SEQ_KEY, value: seq });
        if (seq > 0) {
          // Fresh device: the sync server mints pushed_seq = 0, so the very
          // first push must carry device_seq 1 — the watermarks are unset.
          await t('localMeta').put({ key: SYNC_PUSH_ACK_KEY, value: 0 });
          await t('localMeta').put({ key: SYNC_PULL_SEQ_KEY, value: 0 });
        }
      });
  }
}

export const db = new OfflineDatabase();

// ======================================================================
// Sync identity, envelopes, and the outbox (ADR-002 §2, §4, §6)
// ======================================================================

const DEVICE_STORAGE_KEY = 'wakulima-device-id';
let deviceMemoryId: string | null = null;

/** Stable per-install device uuid. Sync configuration may REPLACE this with
 *  the server-minted device id (see sync-client); both are stable attribution. */
export function getDeviceId(): string {
  if (deviceMemoryId) return deviceMemoryId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_STORAGE_KEY);
  } catch {
    id = null;
  }
  if (!id) {
    id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `wk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    } catch {
      // Non-persistent contexts still get a per-session identity.
    }
  }
  deviceMemoryId = id;
  return id;
}

/** Adopt the server-minted device id as the local attribution uuid. */
export function setDeviceId(id: string): void {
  deviceMemoryId = id;
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

async function nextMetaValue(key: string): Promise<number> {
  const entry = await db.localMeta.get(key);
  const next = (entry ? entry.value : 0) + 1;
  await db.localMeta.put({ key, value: next });
  return next;
}

/**
 * Ambient-tx-relative runner: when the caller already holds a transaction,
 * Dexie attaches table ops to it (nested same-db same-mode transactions are
 * supported); otherwise we open our own. Callers MUST have every table in
 * their outer transaction listed in `tables`.
 */
async function runAmbient<T>(tables: Parameters<typeof db.transaction>[1], fn: () => Promise<T>): Promise<T> {
  if (Dexie.currentTransaction) return fn();
  return db.transaction('rw', tables as never, fn);
}

export const SYNC_TX_TABLES = [
  db.localProducts, db.localCustomers, db.localSales, db.localReturns,
  db.localPayments, db.localAdjustments, db.localAudit,
  db.localOutbox, db.localMeta,
];

/** Mint the next envelope pair for this device. Caller must be inside a tx
 *  covering localMeta (all our write paths are). */
export async function stampNewEnvelope(): Promise<{ device_id: string; device_seq: number }> {
  const device_seq = await nextMetaValue(DEVICE_SEQ_KEY);
  return { device_id: getDeviceId(), device_seq };
}

/** Pure minter usable inside any ambient transaction. */
export async function stampEnvelope<T extends object>(row: T): Promise<T & { device_id: string; device_seq: number }> {
  const env = await stampNewEnvelope();
  return Object.assign({}, row, env) as T & { device_id: string; device_seq: number };
}

// ---------- wire representation (server column set; freeze at write time) ----------

export function toWireRecord(table: string, row: SyncRow | null): Record<string, unknown> | null {
  if (!row) return null;
  switch (table) {
    case 'products':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.created_at, updated_at: row.updated_at ?? row.created_at,
        deleted_at: row.deleted_at ?? null,
        opening_stock: row.opening_stock ?? 0,
        name: row.name, category: row.category, unit: row.unit,
        selling_price: row.selling_price, cost_price: row.cost_price,
        reorder_level: row.reorder_level, barcode: row.barcode ?? null,
      };
    case 'customers':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.created_at, updated_at: row.updated_at ?? row.created_at,
        deleted_at: row.deleted_at ?? null,
        name: row.name, phone: row.phone ?? '', credit_limit: row.credit_limit,
        // outstanding_balance is DERIVED (ADR-002 §3.3) — never a synced column.
        store_id: STORE_ID,
      };
    case 'sales':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.timestamp, updated_at: row.updated_at ?? row.timestamp,
        deleted_at: row.deleted_at ?? null,
        customer_id: row.customer_id ?? null, total_amount: row.total_amount,
        payment_method: row.payment_method, mpesa_reference: row.mpesa_reference ?? null,
        receipt_number: row.receipt_number ?? 0, status: row.status,
        timestamp: row.timestamp, store_id: row.store_id ?? STORE_ID,
      };
    case 'sale_items':
      return {
        id: row.id, sale_id: row.sale_id, product_id: row.product_id,
        product_name: row.product_name, quantity: row.quantity,
        unit_price: row.unit_price, total_line: row.total_line,
        item_seq: row.item_seq ?? 1,
      };
    case 'returns':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.created_at, updated_at: row.updated_at ?? row.created_at,
        deleted_at: row.deleted_at ?? null,
        sale_id: row.sale_id, product_id: row.product_id, quantity: row.quantity,
        reason: row.reason ?? '', return_type: row.return_type,
        refund_amount: row.refund_amount, status: row.status,
        notes: row.notes ?? '', completed_at: row.completed_at ?? null,
      };
    case 'payments':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.created_at, updated_at: row.updated_at ?? row.created_at,
        deleted_at: row.deleted_at ?? null,
        customer_id: row.customer_id, amount: row.amount, method: row.method,
        note: row.note ?? '',
      };
    case 'adjustments':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.created_at, updated_at: row.updated_at ?? row.created_at,
        deleted_at: row.deleted_at ?? null,
        product_id: row.product_id, delta: row.delta, reason: row.reason,
        note: row.note ?? '',
      };
    case 'audit_events':
      return {
        id: row.id, device_seq: row.device_seq,
        created_at: row.created_at, updated_at: row.created_at,
        deleted_at: null,
        user_id: row.user_id ?? null, action: row.action, table_name: row.table_name,
        record_id: row.record_id ?? null,
        old_values: row.old_values ?? null, new_values: row.new_values ?? null,
      };
    default:
      return null;
  }
}

export function wireSaleItems(sale: Sale): Record<string, unknown>[] {
  return (sale.items ?? []).map((item, i) => toWireRecord('sale_items', { ...item, item_seq: item.item_seq ?? i + 1 })!);
}

export function outboxEntry(row: SyncRow & { device_seq?: number }, table: string): LocalOutboxEntry | null {
  const record = toWireRecord(table, row);
  if (!record) return null;
  const entry: LocalOutboxEntry = { seq: row.device_seq ?? 0, table, record };
  if (table === 'sales') {
    const children = wireSaleItems(row as Sale);
    if (children.length) entry.children = { table: 'sale_items', records: children };
  }
  return entry;
}

/** Append the frozen wire version of a stamped row to the push outbox. */
async function enqueueOutbox(row: SyncRow & { device_seq?: number }, table: string): Promise<void> {
  const entry = outboxEntry(row, table);
  if (entry) await db.localOutbox.put(entry);
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- mutation notifier (sync-client registers a debounced trigger) ----------

let mutateNotifier: (() => void) | null = null;

export function setMutationNotifier(fn: (() => void) | null): void {
  mutateNotifier = fn;
}

function notifyMutation(): void {
  try {
    mutateNotifier?.();
  } catch {
    // never let sync plumbing break a sale (ADR-002 §1)
  }
}

// ======================================================================
// Generic synced-row creators/updaters (P-class rows the UI mutates)
// ======================================================================

export type SyncedCreateTable = 'products' | 'customers';

/** Insert a brand-new synced row: stamps the envelope, writes to the main
 *  table (ambient-aware so it can run inside a caller transaction), and
 *  queues its wire version. Set `opening_stock` explicitly for products;
 *  otherwise the stock quantity doubles as the opening. */
export async function createSyncedRecord(table: SyncedCreateTable, row: SyncRow): Promise<SyncRow> {
  const tables = table === 'products'
    ? [db.localProducts, db.localMeta, db.localOutbox]
    : [db.localCustomers, db.localMeta, db.localOutbox];
  const prepared: SyncRow = { ...row };
  if (table === 'products') {
    if (prepared.opening_stock === undefined) prepared.opening_stock = prepared.stock_quantity ?? 0;
  }
  if (table === 'customers' && prepared.updated_at === undefined) prepared.updated_at = nowIso();
  await runAmbient(tables as never, async () => {
    const stamped = await stampEnvelope(prepared);
    await (table === 'products' ? db.localProducts : db.localCustomers).put(stamped as never);
    await enqueueOutbox(stamped, table);
  });
  notifyMutation();
  return prepared;
}

export type SyncedUpdateTable = 'products' | 'customers';

/** Patch one field set on an existing synced row: bumps updated_at, mints a
 *  NEW device_seq (a version), and queues it. This is the ONLY sanctioned
 *  write path for profile fields — a bare `db.localProducts.update` would
 *  mutate content without moving the counter and the server's upsert guard
 *  would then silently keep the stale version fleet-wide. */
export async function updateSyncedRecord(
  table: SyncedUpdateTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<SyncRow | null> {
  const main = table === 'products' ? db.localProducts : db.localCustomers;
  const tables = table === 'products'
    ? [db.localProducts, db.localMeta, db.localOutbox]
    : [db.localCustomers, db.localMeta, db.localOutbox];
  const result = await runAmbient(tables as never, async () => {
    const current = await main.get(id);
    if (!current) return null;
    const next = { ...(current as Record<string, unknown>), ...patch, updated_at: nowIso() };
    const stamped = await stampEnvelope(next);
    await main.put(stamped as never);
    await enqueueOutbox(stamped, table);
    return stamped;
  });
  if (result) notifyMutation();
  return result;
}

/** Tombstone a synced row (S-class): newest deletion wins, rows are never
 *  purged locally or fleet-side (ADR-002 §3). */
export async function tombstoneSyncedRecord(
  table: 'products' | 'customers',
  id: string,
  note?: string,
): Promise<SyncRow | null> {
  const updated = await updateSyncedRecord(table, id, { deleted_at: nowIso() });
  if (updated) {
    await runAmbient([db.localAudit, db.localMeta, db.localOutbox] as never, async () => {
      await addAudit(table === 'products' ? 'delete_product' : 'delete_customer', table, id, { deleted_at: updated.deleted_at, note });
    });
  }
  return updated;
}

/** Bulk-insert new products (CSV import), each with its own envelope. */
export async function bulkImportProducts(rows: Product[]): Promise<number> {
  return db.transaction('rw', [db.localProducts, db.localMeta, db.localOutbox], async () => {
    let added = 0;
    for (const row of rows) {
      await createSyncedRecord('products', { ...row, opening_stock: row.opening_stock ?? row.stock_quantity });
      added += 1;
    }
    return added;
  });
}

// ======================================================================
// Derived state (ADR-002 §3.1/§3.3): stock and credit balances are
// materialized views over the event corpus, recomputed after pulls.
// ======================================================================

export function reconcileOpeningStock(current: number, soldAll: number, returnedCompleted: number): number {
  // current = opening − Σsales(any status) + Σreturns(completed)  →  invert.
  return current + soldAll - returnedCompleted;
}

/** Stock counts EVERY sale (sold units physically left even if later voided —
 *  voids write +delta adjustment events, which is how they reconcile). */
export function computeProductStock(input: { opening_stock: number; sold: number; returned: number; adjusted: number }): number {
  return input.opening_stock - input.sold + input.returned + input.adjusted;
}

/** Balance counts only completed credit sales; completed returns count only
 *  while their parent sale is still completed (the direct path mirrors this:
 *  void subtracts the sale money, and return money cannot double-subtract). */
export function computeCustomerBalance(input: { creditSales: number; creditReturns: number; paymentAmount: number }): number {
  return input.creditSales - input.creditReturns - input.paymentAmount;
}

function customerBalancesFromEvents(
  customers: Customer[],
  sales: Sale[],
  returns: { sale_id: string; product_id?: string; refund_amount: number; status: string; return_type: string }[],
  payments: { customer_id: string; amount: number }[] = [],
): Map<string, number> {
  const creditBySale = new Map<string, { customer_id: string | null; status: string }>();
  for (const s of sales) {
    if (s.payment_method === 'credit') creditBySale.set(s.id, { customer_id: s.customer_id, status: s.status });
  }
  const creditSales = new Map<string, number>();
  for (const s of sales) {
    if (s.payment_method === 'credit' && s.status === 'completed' && s.customer_id) {
      creditSales.set(s.customer_id, (creditSales.get(s.customer_id) ?? 0) + s.total_amount);
    }
  }
  const creditReturns = new Map<string, number>();
  for (const r of returns) {
    if (r.status !== 'completed') continue;
    const parent = creditBySale.get(r.sale_id);
    if (parent && parent.status === 'completed' && parent.customer_id) {
      creditReturns.set(parent.customer_id, (creditReturns.get(parent.customer_id) ?? 0) + r.refund_amount);
    }
  }
  const payments_ = new Map<string, number>();
  for (const p of payments) {
    payments_.set(p.customer_id, (payments_.get(p.customer_id) ?? 0) + p.amount);
  }
  const out = new Map<string, number>();
  for (const c of customers) {
    out.set(c.id, computeCustomerBalance({
      creditSales: creditSales.get(c.id) ?? 0,
      creditReturns: creditReturns.get(c.id) ?? 0,
      paymentAmount: payments_.get(c.id) ?? 0,
    }));
  }
  return out;
}

export interface RecomputeResult {
  sold_through: string[];
  changed_products: number;
  changed_customers: number;
}

/** Recompute every product's stock and customer's balance from the event
 *  corpus and write the materialized fields back. Called after applying
 *  remote pulls (local paths keep the materialized fields current
 *  incrementally — equivalence is property-tested). */
export async function recomputeDerivedState(): Promise<RecomputeResult> {
  return db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localPayments, db.localAdjustments], async () => {
    const products = await db.localProducts.toArray();
    const customers = await db.localCustomers.toArray();
    const sales = await db.localSales.toArray();
    const returns = await db.localReturns.toArray();
    const payments = await db.localPayments.toArray();
    const adjustments = await db.localAdjustments.toArray();

    const soldQty = new Map<string, number>();
    for (const s of sales) for (const item of s.items ?? []) {
      soldQty.set(item.product_id, (soldQty.get(item.product_id) ?? 0) + item.quantity);
    }
    for (const r of returns) {
      if (r.status === 'completed') {
        soldQty.set(r.product_id, Math.max(0, (soldQty.get(r.product_id) ?? 0) - r.quantity));
      }
    }
    const adjustedQty = new Map<string, number>();
    for (const a of adjustments) {
      adjustedQty.set(a.product_id, (adjustedQty.get(a.product_id) ?? 0) + a.delta);
    }

    let changedProducts = 0;
    const soldThrough: string[] = [];
    for (const p of products) {
      const stock = computeProductStock({
        opening_stock: p.opening_stock ?? p.stock_quantity,
        sold: soldQty.get(p.id) ?? 0,
        returned: 0, // returns folded into sold reductions above
        adjusted: adjustedQty.get(p.id) ?? 0,
      });
      if (stock !== p.stock_quantity) changedProducts += 1;
      if (stock < 0) soldThrough.push(p.id);
      await db.localProducts.put({ ...p, stock_quantity: stock });
    }

    const balances = customerBalancesFromEvents(customers, sales, returns, payments);
    let changedCustomers = 0;
    for (const c of customers) {
      const balance = balances.get(c.id) ?? 0;
      if (balance !== c.outstanding_balance) changedCustomers += 1;
      await db.localCustomers.put({ ...c, outstanding_balance: balance });
    }
    return { sold_through: soldThrough, changed_products: changedProducts, changed_customers: changedCustomers };
  });
}

// ======================================================================
// Events: credit payments and stock adjustments (the §3.3/§3.1 writes)
// ======================================================================

export async function createCreditPayment(input: {
  customer_id: string;
  amount: number;
  method?: 'cash' | 'mpesa';
  note?: string;
}): Promise<CreditPayment> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('Payment amount must be a positive integer of cents');
  }
  return db.transaction('rw', [db.localPayments, db.localCustomers, db.localMeta, db.localAudit, db.localOutbox], async () => {
    const customer = await db.localCustomers.get(input.customer_id);
    if (!customer) throw new Error('Customer not found');

    const payment: CreditPayment = {
      id: crypto.randomUUID(),
      customer_id: input.customer_id,
      amount: input.amount,
      method: input.method ?? 'cash',
      note: input.note ?? '',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const stamped = await stampEnvelope(payment);
    await db.localPayments.put(stamped);
    await enqueueOutbox(stamped, 'payments');

    // Direct incremental mirror of the event (== derived math, property-tested).
    const balance = customer.outstanding_balance - input.amount;
    await db.localCustomers.put({ ...customer, outstanding_balance: balance });

    await addAudit('record_payment', 'payments', stamped.id, {
      customer_id: input.customer_id, amount: input.amount, method: stamped.method, balance_after: balance,
    });
    notifyMutation();
    return stamped;
  });
}

/**
 * Debt that predates any recorded sale (seeded books, legacy imports, the
 * v7 reconcile) becomes a negative 'opening' payment EVENT — never a silent
 * balance write (ADR-002 §9.2 approval). `balanceDelta` is the debt amount
 * the customer starts with; the stored row's balance field is untouched.
 */
export async function createOpeningBalanceEvent(customerId: string, balanceDelta: number): Promise<CreditPayment | null> {
  if (!Number.isSafeInteger(balanceDelta) || balanceDelta === 0) return null;
  return runAmbient([db.localPayments, db.localCustomers, db.localMeta, db.localAudit, db.localOutbox] as never, async () => {
    const customer = await db.localCustomers.get(customerId);
    if (!customer) throw new Error('Customer not found');
    const payment: CreditPayment = {
      id: crypto.randomUUID(),
      customer_id: customerId,
      amount: -balanceDelta,
      method: 'opening',
      note: 'opening balance event (no backing sale in the event corpus)',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const stamped = await stampEnvelope(payment);
    await db.localPayments.put(stamped);
    await enqueueOutbox(stamped, 'payments');
    return stamped;
  });
}

export async function createStockAdjustment(input: {
  product_id: string;
  delta: number;
  reason?: StockAdjustment['reason'];
  note?: string;
}): Promise<StockAdjustment> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new Error('Adjustment delta must be a non-zero integer');
  }
  return db.transaction('rw', [db.localAdjustments, db.localProducts, db.localMeta, db.localAudit, db.localOutbox], async () => {
    const product = await db.localProducts.get(input.product_id);
    if (!product) throw new Error('Product not found');

    const adjustment: StockAdjustment = {
      id: crypto.randomUUID(),
      product_id: input.product_id,
      delta: input.delta,
      reason: input.reason ?? 'other',
      note: input.note ?? '',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const stamped = await stampEnvelope(adjustment);
    await db.localAdjustments.put(stamped);
    await enqueueOutbox(stamped, 'adjustments');

    await db.localProducts.put({ ...product, stock_quantity: product.stock_quantity + input.delta });

    await addAudit('stock_adjustment', 'adjustments', stamped.id, {
      product_id: input.product_id, delta: input.delta, reason: stamped.reason,
      stock_after: product.stock_quantity + input.delta,
    });
    notifyMutation();
    return stamped;
  });
}

// ======================================================================
// Seed
// ======================================================================

// Seed local tables once from mock data
export async function seedLocal(): Promise<void> {
  const { mockProducts, mockCustomers } = await import('@/data/mockData');
  const { STORE_ID } = await import('@/lib/backend');
  const count = await db.localProducts.count();
  if (count > 0) return;
  await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localPayments, db.localAdjustments, db.localAudit, db.localOutbox, db.localMeta], async () => {
    // bulkPut, not bulkAdd: two tabs can open the app at the same moment and
    // both pass the count check above. Upsert makes concurrent seeding safe.
    for (const p of mockProducts.map(p => ({ ...p, store_id: STORE_ID }))) {
      if (await db.localProducts.get(p.id)) continue;
      await createSyncedRecord('products', p);
    }
    for (const c of mockCustomers) {
      if (await db.localCustomers.get(c.id)) continue;
      await createSyncedRecord('customers', c);
      // Seeded debt gets an event so the FIRST recompute reproduces it
      // (balances derive from events, never from bare writes — §3.3).
      if (c.outstanding_balance > 0) {
        await createOpeningBalanceEvent(c.id, c.outstanding_balance);
      }
    }
  });
}

// Sequential counters (receipt numbers and future cursors). The counter row
// is created on first use; increments happen in their own transaction so a
// rolled-back sale never burns a number's uniqueness guarantee.
export async function nextSeq(key: string): Promise<number> {
  return db.transaction('rw', db.localMeta, async () => {
    const entry = (await db.localMeta.get(key)) ?? { key, value: 0 };
    const next = entry.value + 1;
    await db.localMeta.put({ key, value: next });
    return next;
  });
}

// Atomic local sale: checks stock + credit, decrements, inserts sale. Throws on validation.
export async function processLocalSale(
  storeId: string,
  customerId: string | null,
  paymentMethod: 'cash' | 'mpesa' | 'credit',
  items: { product_id: string; product_name: string; quantity: number; unit_price: number; total_line: number }[],
  totalAmount: number,
  mpesaReference?: string,
  userId?: string | null
): Promise<string> {
  return db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localMeta, db.localAudit, db.localOutbox], async () => {
    if (paymentMethod === 'credit') {
      if (!customerId || customerId === 'walk-in') throw new Error('Credit sales require a registered customer');
      const customer = await db.localCustomers.get(customerId);
      if (!customer) throw new Error('Customer not found');
      if (customer.outstanding_balance + totalAmount > customer.credit_limit) {
        throw new Error('Sale exceeds customer credit limit');
      }
    }
    if (paymentMethod === 'mpesa') {
      const ref = (mpesaReference ?? '').trim();
      if (!ref) throw new Error('M-Pesa reference is required for M-Pesa sales');
      if (ref.length > 32) throw new Error('M-Pesa reference must be 32 characters or fewer');
    }
    for (const item of items) {
      const product = await db.localProducts.get(item.product_id);
      if (!product) throw new Error(`Product ${item.product_name} not found`);
      if (product.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${item.product_name}. Available: ${product.stock_quantity}, Requested: ${item.quantity}`);
      }
    }
    for (const item of items) {
      const product = (await db.localProducts.get(item.product_id))!;
      await db.localProducts.update(item.product_id, { stock_quantity: product.stock_quantity - item.quantity });
    }
    if (paymentMethod === 'credit' && customerId) {
      const customer = (await db.localCustomers.get(customerId))!;
      await db.localCustomers.update(customerId, { outstanding_balance: customer.outstanding_balance + totalAmount });
    }
    const saleId = crypto.randomUUID();
    const base: Sale = {
      id: saleId,
      customer_id: customerId,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      ...(paymentMethod === 'mpesa' ? { mpesa_reference: (mpesaReference ?? '').trim() } : {}),
      receipt_number: await nextSeq(RECEIPT_SEQ_KEY),
      status: 'completed',
      timestamp: new Date().toISOString(),
      store_id: storeId,
      items: items.map((item, i) => ({ ...item, id: crypto.randomUUID(), sale_id: saleId, item_seq: i + 1 }))
    };
    const sale = await stampEnvelope(base);
    await db.localSales.add(sale);
    await enqueueOutbox(sale, 'sales');
    await addAudit('create_sale', 'sales', saleId, { total: totalAmount, method: paymentMethod, items: items.length }, userId);
    notifyMutation();
    return saleId;
  });
}

// ---- Local audit trail ----
export async function addAudit(
  action: string,
  table_name: string,
  record_id?: string | null,
  new_values?: unknown,
  user_id?: string | null,
  old_values?: unknown
): Promise<void> {
  await runAmbient([db.localAudit, db.localMeta, db.localOutbox] as never, async () => {
    const entry: LocalAuditEntry = {
      id: crypto.randomUUID(),
      user_id: user_id ?? getSessionUserId(),
      action,
      table_name,
      record_id: record_id ?? null,
      old_values,
      new_values,
      created_at: new Date().toISOString()
    };
    const stamped = await stampEnvelope(entry);
    await db.localAudit.add(stamped);
    await enqueueOutbox(stamped, 'audit_events');
  });
}

function getSessionUserId(): string | null {
  try {
    const raw = localStorage.getItem('wakulima-session');
    return raw ? (JSON.parse(raw) as { id: string }).id : null;
  } catch {
    return null;
  }
}

export async function getAudit(limit = 500): Promise<LocalAuditEntry[]> {
  return db.localAudit.orderBy('created_at').reverse().limit(limit).toArray();
}

// ---- Local returns ----
// A return must reference a product line from the referenced sale; the refund
// amount is always derived from what was actually paid (the sale line price),
// never from the current catalog price, and never more than what is still
// returnable for that line (purchased minus already-returned).
export async function createLocalReturn(input: {
  sale_id: string;
  product_id: string;
  quantity: number;
  reason: string;
  return_type: string;
  notes: string;
  status?: string;
}): Promise<LocalReturn> {
  return db.transaction('rw', [db.localReturns, db.localSales, db.localMeta, db.localOutbox], async () => {
    const sale = await db.localSales.get(input.sale_id);
    if (!sale) throw new Error('Sale not found');
    if (sale.status === 'voided') {
      throw new Error('Cannot return items from a voided sale');
    }

    const line = sale.items.find(i => i.product_id === input.product_id);
    if (!line) throw new Error('Product was not purchased in this sale');

    const quantity = Math.floor(input.quantity);
    if (!Number.isFinite(input.quantity) || quantity <= 0) {
      throw new Error('Return quantity must be at least 1');
    }

    const priorReturns = await db.localReturns.where('sale_id').equals(input.sale_id).toArray();
    const alreadyReturned = priorReturns
      .filter(r => r.product_id === input.product_id && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantity, 0);
    const returnable = line.quantity - alreadyReturned;
    if (quantity > returnable) {
      throw new Error(`Cannot return ${quantity}: only ${returnable} of ${line.quantity} purchased units still returnable`);
    }

    // Money must be refunded at the price the customer actually paid.
    // Integer cents × integer quantity stays exact — no rounding needed.
    const refund_amount = line.unit_price * quantity;

    const base: LocalReturn = {
      sale_id: input.sale_id,
      product_id: input.product_id,
      quantity,
      reason: input.reason,
      return_type: input.return_type,
      refund_amount,
      status: input.status ?? 'pending',
      notes: input.notes,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    const entry = await stampEnvelope(base);
    await db.localReturns.add(entry);
    await enqueueOutbox(entry, 'returns');
    notifyMutation();
    return entry;
  });
}

// ---- Sale lifecycle ----
// Voiding is a full reversal inside one transaction: the sale is marked
// 'voided' (kept for the audit trail), the un-restocked net units come back
// as a stock-ADJUSTMENT EVENT (so derived stock across all tills reconciles),
// and the credit balance loses the sale money — UNCLAMPED. Post-§3.3 a
// customer may have already paid into the tab; voiding then leaves the
// balance negative: money the shop owes back. That is exact, and identical
// to the derived recompute (completed sales exclude voided ones).
export async function voidLocalSale(
  saleId: string,
  reason: string,
  userId?: string | null
): Promise<void> {
  await db.transaction(
    'rw',
    [db.localSales, db.localProducts, db.localCustomers, db.localAudit, db.localReturns, db.localAdjustments, db.localMeta, db.localOutbox],
    async () => {
      const sale = await db.localSales.get(saleId);
      if (!sale) throw new Error('Sale not found');
      if (sale.status === 'voided') throw new Error('Sale has already been voided');

      // Restock: the goods come back — but only the net. Completed returns
      // already put some units back on the shelf, so restocking the full sale
      // quantity would conjure stock from nothing. Net = sale qty − completed
      // return qty (clamped at 0). Each product delta becomes an adjustment
      // EVENT (recompute on any till yields the same stock).
      const completedReturns = await db.localReturns
        .where('sale_id')
        .equals(saleId)
        .toArray();
      const returnedQty = new Map<string, number>();
      for (const r of completedReturns) {
        if (r.status !== 'completed') continue;
        returnedQty.set(
          r.product_id,
          (returnedQty.get(r.product_id) ?? 0) + r.quantity
        );
      }
      for (const item of sale.items) {
        const product = await db.localProducts.get(item.product_id);
        if (!product) throw new Error(`Product ${item.product_name} no longer exists; cannot void`);
        const net = item.quantity - Math.min(returnedQty.get(item.product_id) ?? 0, item.quantity);
        if (net > 0) {
          const adjustment: StockAdjustment = {
            id: crypto.randomUUID(),
            product_id: item.product_id,
            delta: net,
            reason: 'void',
            note: `void of sale ${saleId}`,
            created_at: nowIso(),
            updated_at: nowIso(),
          };
          const stampedAdj = await stampEnvelope(adjustment);
          await db.localAdjustments.put(stampedAdj);
          await enqueueOutbox(stampedAdj, 'adjustments');
          await db.localProducts.put({
            ...product,
            stock_quantity: product.stock_quantity + net,
          });
        }
      }

      // Credit reversal: subtract only the STILL-UN-REFUNDED sale money,
      // unclamped (see doc comment). Completed returns already returned part
      // of the customer's debt — re-subtracting them here would double-count
      // the refund and diverge from the event-corpus recompute.
      if (sale.payment_method === 'credit' && sale.customer_id) {
        const refundedToCustomer = completedReturns
          .filter(r => r.status === 'completed' && (r.return_type === 'refund' || r.return_type === 'credit'))
          .reduce((sum, r) => sum + r.refund_amount, 0);
        const moneyNet = sale.total_amount - refundedToCustomer;
        if (moneyNet > 0) {
          const customer = await db.localCustomers.get(sale.customer_id);
          if (customer) {
            await db.localCustomers.put({
              ...customer,
              outstanding_balance: customer.outstanding_balance - moneyNet,
            });
          }
        }
      }

      // The void is a NEW VERSION of the sale row (LWW on the server).
      const voided = await stampEnvelope({ ...sale, status: 'voided', updated_at: nowIso() });
      await db.localSales.put(voided);
      await enqueueOutbox(voided, 'sales');

      await addAudit('void_sale', 'sales', saleId, { status: 'voided', reason }, userId);
      notifyMutation();
    }
  );
}

export async function updateLocalReturnStatus(id: string, status: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.localReturns, db.localProducts, db.localSales, db.localCustomers, db.localMeta, db.localOutbox],
    async () => {
      const ret = await db.localReturns.get(id);
      if (!ret) throw new Error('Return not found');
      if (ret.status === 'completed') throw new Error('Return has already been completed');
      if (ret.status === 'rejected') {
        // Rejected is terminal: nothing was restocked or refunded at rejection
        // time (units were freed back), so completing one now would
        // double-apply the reversal.
        throw new Error('Return was rejected and cannot be completed');
      }

      const updated = await stampEnvelope({
        ...ret,
        status,
        ...(status === 'completed' ? { completed_at: nowIso() } : {}),
        updated_at: nowIso(),
      });
      await db.localReturns.put(updated);
      await enqueueOutbox(updated, 'returns');

      // Restock once when a return completes (the goods come back for all types).
      if (status === 'completed') {
        const product = await db.localProducts.get(ret.product_id);
        if (product) {
          await db.localProducts.put({ ...product, stock_quantity: product.stock_quantity + ret.quantity });
        }

        // Reverse the money: refunds and store credits return value to the
        // customer. Only credit sales carry a balance in the system, so only
        // those are adjusted; cash/mpesa refunds leave the till physically.
        if (ret.return_type === 'refund' || ret.return_type === 'credit') {
          const sale = await db.localSales.get(ret.sale_id);
          if (sale && sale.payment_method === 'credit' && sale.customer_id) {
            const customer = await db.localCustomers.get(sale.customer_id);
            if (customer) {
              const newBalance = customer.outstanding_balance - ret.refund_amount;
              await db.localCustomers.put({ ...customer, outstanding_balance: newBalance });
            }
          }
        }
      }
      notifyMutation();
    }
  );
}

export async function getLocalReturns(): Promise<LocalReturn[]> {
  return db.localReturns.orderBy('created_at').reverse().toArray();
}

// ---- Legacy-corpus reconciliation (v7 migration wrapper + restore path) ----
// Stamps envelopes onto any row still missing them, derives opening stock,
// converts legacy stored balances that events cannot explain into 'opening'
// credit-payment events, and queues every resulting version for push.
export async function ensureSyncEnvelopes(): Promise<void> {
  await db.transaction('rw', SYNC_TX_TABLES, async () => {
    const products = await db.localProducts.toArray();
    const customers = await db.localCustomers.toArray();
    const sales = await db.localSales.toArray();
    const returns = await db.localReturns.toArray();
    const audit = await db.localAudit.toArray();

    let stampedCount = 0;
    let reconciledCustomers = 0;
    let seq = (await db.localMeta.get(DEVICE_SEQ_KEY))?.value ?? 0;
    const deviceId = getDeviceId();
    const mint = (row: SyncRow): SyncRow => {
      seq += 1;
      return { ...row, device_id: deviceId, device_seq: seq };
    };

    // 1. opening stock for products that lack it
    const soldQty = new Map<string, number>();
    for (const s of sales) for (const item of s.items ?? []) {
      soldQty.set(item.product_id, (soldQty.get(item.product_id) ?? 0) + item.quantity);
    }
    const returnedQty = new Map<string, number>();
    for (const r of returns) {
      if (r.status === 'completed') returnedQty.set(r.product_id, (returnedQty.get(r.product_id) ?? 0) + r.quantity);
    }
    for (const p of products) {
      if (p.opening_stock === undefined) {
        const opening = reconcileOpeningStock(p.stock_quantity, soldQty.get(p.id) ?? 0, returnedQty.get(p.id) ?? 0);
        await db.localProducts.put({ ...p, opening_stock: opening });
        stampedCount += 1;
      }
    }

    // 2. legacy balances → opening payment events (only where events disagree)
    const payments = await db.localPayments.toArray();
    const customersFresh = await db.localCustomers.toArray();
    const derived = customerBalancesFromEvents(customersFresh, sales, returns, payments);
    for (const c of customersFresh) {
      const expected = derived.get(c.id) ?? 0;
      if (c.outstanding_balance !== expected) {
        const diff = c.outstanding_balance - expected;
        const payment: CreditPayment = {
          id: crypto.randomUUID(),
          customer_id: c.id,
          amount: -diff,
          method: 'opening',
          note: 'legacy balance converted to an event (ensureSyncEnvelopes)',
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        const stamped = mint(payment);
        await db.localPayments.put(stamped as never);
        await enqueueOutbox(stamped, 'payments');
        // The snapshot row IS the truth; the event merely explains it, so
        // recomputes after this point reproduce the stored balance exactly.
        reconciledCustomers += 1;
        stampedCount += 1;
      }
    }

    // 3. deterministic envelope backfill for the remaining un-stamped rows
    const merged: { table: string; row: SyncRow; main: Table<SyncRow, string> }[] = [
      ...(await db.localProducts.toArray()).map(row => ({ table: 'products', row, main: db.localProducts as Table<SyncRow, string> })),
      ...(await db.localCustomers.toArray()).map(row => ({ table: 'customers', row, main: db.localCustomers as Table<SyncRow, string> })),
      ...sales.map(row => ({ table: 'sales', row, main: db.localSales as Table<SyncRow, string> })),
      ...returns.map(row => ({ table: 'returns', row, main: db.localReturns as Table<SyncRow, string> })),
      ...audit.map(row => ({ table: 'audit_events', row, main: db.localAudit as Table<SyncRow, string> })),
    ];
    const pending = merged.filter(entry => entry.row.device_seq === undefined || entry.row.device_id === undefined);
    // Wait: sales/returns/audit/rows may have been re-read after step 2 — the
    // re-reads keep freshness; sorting is by (created_at, id) — deterministic
    // regardless of reordering across processes.
    void products;
    void customers;
    pending.sort((a, b) => {
      const ka = String(a.row.created_at ?? a.row.timestamp ?? '');
      const kb = String(b.row.created_at ?? b.row.timestamp ?? '');
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
    });
    for (const entry of pending) {
      const stamped = mint(entry.row);
      await entry.main.put(stamped);
      await enqueueOutbox(stamped, entry.table);
      stampedCount += 1;
    }

    await db.localMeta.put({ key: DEVICE_SEQ_KEY, value: seq });
    const pushAck = (await db.localMeta.get(SYNC_PUSH_ACK_KEY))?.value ?? 0;
    const pullSeq = (await db.localMeta.get(SYNC_PULL_SEQ_KEY))?.value ?? 0;
    if (typeof pushAck !== 'number') await db.localMeta.put({ key: SYNC_PUSH_ACK_KEY, value: 0 });
    if (typeof pullSeq !== 'number') await db.localMeta.put({ key: SYNC_PULL_SEQ_KEY, value: 0 });

    if (stampedCount > 0 || reconciledCustomers > 0) {
      const note: LocalAuditEntry = {
        id: crypto.randomUUID(),
        user_id: null,
        action: 'sync_envelope_migration',
        table_name: 'localMeta',
        record_id: null,
        new_values: { stamped: stampedCount, reconciled_customers: reconciledCustomers, seq_after: seq },
        created_at: nowIso(),
      };
      const stampedNote = mint(note);
      await db.localAudit.add(stampedNote as never);
      await enqueueOutbox(stampedNote, 'audit_events');
    }
  });
}

// ---- Network status (browser events only; there is no server to sync to) ----
export class OfflineManager {
  private static instance: OfflineManager;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: ((isOnline: boolean) => void)[] = [];

  static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  constructor() {
    window.addEventListener('online', () => this.setOnlineStatus(true));
    window.addEventListener('offline', () => this.setOnlineStatus(false));
  }

  private setOnlineStatus(status: boolean) {
    this.isOnline = status;
    this.listeners.forEach(listener => listener(status));
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  addStatusListener(listener: (isOnline: boolean) => void) {
    this.listeners.push(listener);
  }

  removeStatusListener(listener: (isOnline: boolean) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }
}

export const offlineManager = OfflineManager.getInstance();
