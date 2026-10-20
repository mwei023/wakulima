export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  reorder_level: number;
  barcode?: string;
  store_id: string;
  product_id?: string; // Optional legacy reference (unused locally)
  created_at: string;
  updated_at: string;
  /** Events-anchored opening (ADR-002 §3.1): stock = opening − Σsales + Σreturns ± Σadjustments. */
  opening_stock?: number;
  // ---- sync envelope (ADR-002 §2; stamped by the v7 migration and every write) ----
  device_id?: string;
  device_seq?: number;
  /** Tombstone: set kills the row for sync and UI; rows are never purged locally. */
  deleted_at?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  credit_limit: number;
  /** Derived cache (ADR-002 §3.3): UI may read; writes only through events. */
  outstanding_balance: number;
  created_at: string;
  /** Missing on legacy rows; the v7 migration sets it = created_at. */
  updated_at?: string;
  // ---- sync envelope (ADR-002 §2) ----
  device_id?: string;
  device_seq?: number;
  deleted_at?: string | null;
}

/** "Juma paid 500 of his tab" — an event, never a hand-edit on the balance field. */
export interface CreditPayment {
  id: string;
  customer_id: string;
  /** Integer cents (KES × 100); always > 0 — applied as balance −= amount. */
  amount: number;
  /** 'opening' = v7 legacy-balance conversion event (debt predating any recorded sale). */
  method: 'cash' | 'mpesa' | 'opening';
  note?: string;
  created_at: string;
  updated_at?: string;
  // ---- sync envelope ----
  device_id?: string;
  device_seq?: number;
  deleted_at?: string | null;
}

/** Stocktake/damage/loss deltas (ADR-002 §3.1) — never an absolute count. */
export interface StockAdjustment {
  id: string;
  product_id: string;
  /** Signed: +100 found, −3 spoiled. Merges exactly across tills. */
  delta: number;
  reason: 'stocktake' | 'damage' | 'loss' | 'found' | 'other';
  note?: string;
  created_at: string;
  updated_at?: string;
  // ---- sync envelope ----
  device_id?: string;
  device_seq?: number;
  deleted_at?: string | null;
}

export interface Sale {
  id: string;
  customer_id: string | null;
  /** Integer cents (KES × 100) — see utils.kesToCents. */
  total_amount: number;
  payment_method: 'cash' | 'mpesa' | 'credit';
  /**
   * M-Pesa reference (phone or confirmation code) when payment_method is
   * 'mpesa'. Validated in POSInterface, stored verbatim, printed on receipt.
   */
  mpesa_reference?: string;
  /** Sequential receipt number (1-based), assigned transactionally per sale. */
  receipt_number?: number;
  // Tolerant union: legacy records may say 'synced'/'pending'; lifecycle is
  // 'completed' (counts toward money totals) or 'voided' (excluded from money
  // totals). Not an indexed field, so no Dexie version bump is needed.
  status: 'completed' | 'voided' | 'pending' | 'synced';
  timestamp: string;
  store_id: string;
  items: SaleItem[];
  // ---- sync envelope (ADR-002 §2; timestamp doubles as created_at) ----
  updated_at?: string;
  device_id?: string;
  device_seq?: number;
  deleted_at?: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  /** Integer cents (KES × 100) — see utils.kesToCents. */
  unit_price: number;
  /** Integer cents (KES × 100) — see utils.kesToCents. */
  total_line: number;
}

export interface PendingOrder {
  id: string;
  raw_message: string;
  assigned_customer_id: string | null;
  status: 'pending' | 'confirmed' | 'ignored';
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'cashier';
}

export interface CartItem {
  product: Product;
  quantity: number;
  total: number;
}
