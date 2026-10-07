import Dexie, { Table } from 'dexie';
import { Product, Customer, Sale } from '@/types';

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
}

/** Key/value counter storage (receipt sequence and future cursors). */
export interface LocalMetaEntry {
  key: string;
  value: number;
}

export const RECEIPT_SEQ_KEY = 'receipt_seq';

class OfflineDatabase extends Dexie {
  localProducts!: Table<Product, string>;
  localCustomers!: Table<Customer, string>;
  localSales!: Table<Sale, string>;
  localReturns!: Table<LocalReturn, string>;
  localAudit!: Table<LocalAuditEntry, string>;
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
  }
}

export const db = new OfflineDatabase();

// Seed local tables once from mock data
export async function seedLocal(): Promise<void> {
  const { mockProducts, mockCustomers } = await import('@/data/mockData');
  const { STORE_ID } = await import('@/lib/backend');
  const count = await db.localProducts.count();
  if (count > 0) return;
  await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales], async () => {
    // bulkPut, not bulkAdd: two tabs can open the app at the same moment and
    // both pass the count check above. Upsert makes concurrent seeding safe.
    await db.localProducts.bulkPut(mockProducts.map(p => ({ ...p, store_id: STORE_ID })));
    await db.localCustomers.bulkPut(mockCustomers);
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
  mpesaReference?: string
): Promise<string> {
  return db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localMeta], async () => {
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
    const sale: Sale = {
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
    await db.localSales.add(sale);
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
  await db.localAudit.add({
    id: crypto.randomUUID(),
    user_id: user_id ?? getSessionUserId(),
    action,
    table_name,
    record_id: record_id ?? null,
    old_values,
    new_values,
    created_at: new Date().toISOString()
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
  return db.transaction('rw', [db.localReturns, db.localSales], async () => {
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

    const entry: LocalReturn = {
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
    await db.localReturns.add(entry);
    return entry;
  });
}

// ---- Sale lifecycle ----
// Voiding is a full reversal inside one transaction: goods go back on the
// shelf, credit balances shrink back, the sale is marked 'voided' (kept for
// the audit trail, excluded from money totals). Throws on any precondition
// failure so nothing is half-applied.
export async function voidLocalSale(
  saleId: string,
  reason: string,
  userId?: string | null
): Promise<void> {
  await db.transaction('rw', [db.localSales, db.localProducts, db.localCustomers, db.localAudit], async () => {
    const sale = await db.localSales.get(saleId);
    if (!sale) throw new Error('Sale not found');
    if (sale.status === 'voided') throw new Error('Sale has already been voided');

    // Restock: the goods come back.
    for (const item of sale.items) {
      const product = await db.localProducts.get(item.product_id);
      if (!product) throw new Error(`Product ${item.product_name} no longer exists; cannot void`);
      await db.localProducts.update(item.product_id, {
        stock_quantity: product.stock_quantity + item.quantity
      });
    }

    // Credit reversal: only credit sales carry a balance in the system.
    if (sale.payment_method === 'credit' && sale.customer_id) {
      const customer = await db.localCustomers.get(sale.customer_id);
      if (customer) {
        await db.localCustomers.update(customer.id, {
          outstanding_balance: Math.max(0, customer.outstanding_balance - sale.total_amount)
        });
      }
    }

    await db.localSales.update(saleId, { status: 'voided' });
    await addAudit('void_sale', 'sales', saleId, { status: 'voided', reason }, userId);
  });
}

export async function updateLocalReturnStatus(id: string, status: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.localReturns, db.localProducts, db.localSales, db.localCustomers],
    async () => {
      const ret = await db.localReturns.get(id);
      if (!ret) throw new Error('Return not found');
      if (ret.status === 'completed') throw new Error('Return has already been completed');

      await db.localReturns.update(id, {
        status,
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {})
      });

      // Restock once when a return completes (the goods come back for all types).
      if (status === 'completed') {
        const product = await db.localProducts.get(ret.product_id);
        if (product) {
          await db.localProducts.update(ret.product_id, { stock_quantity: product.stock_quantity + ret.quantity });
        }

        // Reverse the money: refunds and store credits return value to the
        // customer. Only credit sales carry a balance in the system, so only
        // those are adjusted; cash/mpesa refunds leave the till physically.
        if (ret.return_type === 'refund' || ret.return_type === 'credit') {
          const sale = await db.localSales.get(ret.sale_id);
          if (sale && sale.payment_method === 'credit' && sale.customer_id) {
            const customer = await db.localCustomers.get(sale.customer_id);
            if (customer) {
              const newBalance = Math.max(0, customer.outstanding_balance - ret.refund_amount);
              await db.localCustomers.update(customer.id, { outstanding_balance: newBalance });
            }
          }
        }
      }
    }
  );
}

export async function getLocalReturns(): Promise<LocalReturn[]> {
  return db.localReturns.orderBy('created_at').reverse().toArray();
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
