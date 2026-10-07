import Dexie, { Table } from 'dexie';
import { Product, Customer, Sale } from '@/types';
import { db, LocalReturn, LocalAuditEntry } from './db';

/**
 * Rolling local backups.
 *
 * The main database (WakulimaAgrovetDB) is the source of truth. These backups
 * exist in a SEPARATE origin database so that corruption or accidental wipes of
 * the main DB don't take the backups down with it. Backups are JSON snapshots,
 * kept N deep, newest last.
 */

export const BACKUP_DB_NAME = 'WakulimaAgrovetDB-backups';
export const MAX_BACKUPS = 7;

interface BackupRecord {
  id?: number;
  created_at: string;
  payload: BackupPayload;
}

export interface BackupPayload {
  schema_version: 1 | 2;
  created_at: string;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  returns: LocalReturn[];
  audit: LocalAuditEntry[];
}

class BackupDatabase extends Dexie {
  snapshots!: Table<BackupRecord, number>;

  constructor() {
    super(BACKUP_DB_NAME);
    this.version(1).stores({
      snapshots: '++id, created_at'
    });
  }
}

export const backupDb = new BackupDatabase();

export async function createBackupPayload(): Promise<BackupPayload> {
  const [products, customers, sales, returns, audit] = await Promise.all([
    db.localProducts.toArray(),
    db.localCustomers.toArray(),
    db.localSales.toArray(),
    db.localReturns.toArray(),
    db.localAudit.toArray(),
  ]);
  return {
    schema_version: 2,
    created_at: new Date().toISOString(),
    products,
    customers,
    sales,
    returns,
    audit,
  };
}

export async function saveRollingBackup(): Promise<number> {
  const payload = await createBackupPayload();
  return backupDb.transaction(
    'rw',
    [backupDb.snapshots],
    async () => {
      const id = await backupDb.snapshots.add({ created_at: payload.created_at, payload });
      const excess = await backupDb.snapshots.orderBy('id').toArray();
      if (excess.length > MAX_BACKUPS) {
        const doomed = excess.slice(0, excess.length - MAX_BACKUPS).map(r => r.id!);
        await backupDb.snapshots.bulkDelete(doomed);
      }
      return id;
    }
  );
}

export async function listBackups(): Promise<{ id: number; created_at: string }[]> {
  const rows = await backupDb.snapshots.toArray();
  return rows
    .map(r => ({ id: r.id!, created_at: r.created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getBackup(id: number): Promise<BackupPayload | null> {
  const row = await backupDb.snapshots.get(id);
  return row ? row.payload : null;
}

export async function latestBackupMeta(): Promise<{ id: number; created_at: string } | null> {
  const last = await backupDb.snapshots.orderBy('id').last();
  return last ? { id: last.id!, created_at: last.created_at } : null;
}

const toCents = (v: unknown): number => Math.round((typeof v === 'number' && Number.isFinite(v) ? v : 0) * 100);

/** Upgrade a legacy v1 (KES floats) payload to v2 (integer cents) in memory. */
function convertV1ToV2(payload: BackupPayload): BackupPayload {
  return {
    ...payload,
    schema_version: 2,
    products: payload.products.map(p => ({
      ...p,
      selling_price: toCents(p.selling_price),
      cost_price: toCents(p.cost_price),
    })),
    customers: payload.customers.map(c => ({
      ...c,
      credit_limit: toCents(c.credit_limit),
      outstanding_balance: toCents(c.outstanding_balance),
    })),
    sales: payload.sales.map(s => ({
      ...s,
      total_amount: toCents(s.total_amount),
      mpesa_reference: s.mpesa_reference,
      receipt_number: s.receipt_number,
      items: s.items.map(i => ({
        ...i,
        unit_price: toCents(i.unit_price),
        total_line: toCents(i.total_line),
      })),
    })),
    returns: payload.returns.map(r => ({
      ...r,
      refund_amount: toCents(r.refund_amount),
    })),
  };
}

/**
 * Restore wipes the main tables and re-inserts the snapshot inside one
 * transaction: either the restore fully happens or nothing changes.
 */
export async function restoreFromPayload(payload: BackupPayload): Promise<void> {
  if (payload.schema_version !== 1 && payload.schema_version !== 2) {
    throw new Error(`Unsupported backup schema version: ${payload.schema_version}`);
  }
  // v1 backups stored KES floats; v2 stores integer cents. Convert v1 up on
  // the way in so the DB is always cents after a restore.
  const normalized =
    payload.schema_version === 1
      ? convertV1ToV2(payload)
      : payload;
  await db.transaction(
    'rw',
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit],
    async () => {
      await Promise.all([
        db.localProducts.clear(),
        db.localCustomers.clear(),
        db.localSales.clear(),
        db.localReturns.clear(),
        db.localAudit.clear(),
      ]);
      await db.localProducts.bulkAdd(normalized.products);
      await db.localCustomers.bulkAdd(normalized.customers);
      await db.localSales.bulkAdd(normalized.sales);
      await db.localReturns.bulkAdd(normalized.returns);
      await db.localAudit.bulkAdd(normalized.audit);
    }
  );
}

const LAST_BACKUP_RUN_KEY = 'wakulima-last-rolling-backup';

/** Run at most once per 20h window; call on app start and on return to the tab. */
export async function runRollingBackupIfDue(): Promise<boolean> {
  try {
    const last = localStorage.getItem(LAST_BACKUP_RUN_KEY);
    if (last) {
      const ageMs = Date.now() - new Date(last).getTime();
      if (ageMs < 20 * 60 * 60 * 1000) return false;
    }
    await saveRollingBackup();
    localStorage.setItem(LAST_BACKUP_RUN_KEY, new Date().toISOString());
    return true;
  } catch (error) {
    // Never block the app on backup failure; surface via console for now.
    console.error('Rolling backup failed:', error);
    return false;
  }
}
