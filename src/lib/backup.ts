import Dexie, { Table } from 'dexie';
import { Product, Customer, Sale } from '@/types';
import { db, LocalReturn, LocalAuditEntry, ensureSyncEnvelopes, DEVICE_SEQ_KEY, SYNC_PUSH_ACK_KEY, SYNC_PULL_SEQ_KEY } from './db';

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
  schema_version: 1 | 2 | 3;
  created_at: string;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  returns: LocalReturn[];
  audit: LocalAuditEntry[];
  meta?: { key: string; value: number }[];
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
    schema_version: 3,
    created_at: new Date().toISOString(),
    products,
    customers,
    sales,
    returns,
    audit,
    meta: await db.localMeta.toArray(),
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

/** Upgrade a legacy v1 (KES floats) or v2 (no counters) payload to v3 in memory. */
function convertLegacyToV3(payload: BackupPayload): BackupPayload {
  return {
    ...payload,
    schema_version: 3,
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
    // v1/v2 payloads carry no receipt counters; leave localMeta untouched on
    // restore rather than resetting a counter that may have advanced.
    meta: payload.meta ?? undefined,
  };
}

/**
 * Restore wipes the main tables and re-inserts the snapshot inside one
 * transaction: either the restore fully happens or nothing changes.
 *
 * v1/v2 payloads are upgraded to v3 on the way in so the DB is always cents
 * + counters after a restore. A v3 restore also replaces localMeta (the
 * receipt counter) so numbering continues rather than restarting at #1.
 *
 * Sync state survives the swap untouched (ADR-002): the per-device seq
 * counter, push ack, and pull watermark are captured live and re-put after
 * the clear — restoring them from the payload could rewind the counter and
 * collide with server-side (device_id, device_seq) uniqueness.
 */
export async function restoreFromPayload(payload: BackupPayload): Promise<void> {
  if (payload.schema_version !== 1 && payload.schema_version !== 2 && payload.schema_version !== 3) {
    throw new Error(`Unsupported backup schema version: ${payload.schema_version}`);
  }
  const normalized = payload.schema_version === 3 ? payload : convertLegacyToV3(payload);
  const liveSyncKeys = {
    device_seq: (await db.localMeta.get(DEVICE_SEQ_KEY))?.value,
    push_ack: (await db.localMeta.get(SYNC_PUSH_ACK_KEY))?.value,
    pull_seq: (await db.localMeta.get(SYNC_PULL_SEQ_KEY))?.value,
  };
  // Outbox row versions reference rows the restore replaces; they are part
  // of the local push continuity and stay. Re-stamped snapshots upsert over
  // any stale versions (newer seq wins server-side).
  await db.transaction(
    'rw',
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit, db.localMeta, db.localPayments, db.localAdjustments],
    async () => {
      await Promise.all([
        db.localProducts.clear(),
        db.localCustomers.clear(),
        db.localSales.clear(),
        db.localReturns.clear(),
        db.localAudit.clear(),
        // The event corpus restarts with the snapshot; pre-snapshot event
        // rows (payments/adjustments) must go or derived recompute would
        // fold them into the restored corpus.
        db.localPayments.clear(),
        db.localAdjustments.clear(),
        // Only a v3 payload owns the counters; legacy restores keep the
        // live counter (never reset a printed-receipt sequence backwards).
        ...(normalized.meta ? [db.localMeta.clear()] : []),
      ]);
      await db.localProducts.bulkAdd(normalized.products);
      await db.localCustomers.bulkAdd(normalized.customers);
      await db.localSales.bulkAdd(normalized.sales);
      await db.localReturns.bulkAdd(normalized.returns);
      await db.localAudit.bulkAdd(normalized.audit);
      if (normalized.meta) {
        await db.localMeta.bulkPut(
          normalized.meta.filter(m => m.key !== DEVICE_SEQ_KEY && m.key !== SYNC_PUSH_ACK_KEY && m.key !== SYNC_PULL_SEQ_KEY),
        );
      }
      if (liveSyncKeys.device_seq !== undefined) await db.localMeta.put({ key: DEVICE_SEQ_KEY, value: liveSyncKeys.device_seq });
      if (liveSyncKeys.push_ack !== undefined) await db.localMeta.put({ key: SYNC_PUSH_ACK_KEY, value: liveSyncKeys.push_ack });
      if (liveSyncKeys.pull_seq !== undefined) await db.localMeta.put({ key: SYNC_PULL_SEQ_KEY, value: liveSyncKeys.pull_seq });
    }
  );
  // Snapshot rows carry the pre-v7 shape (no envelope / opening stock on old
  // backups): rebuild envelopes, openings, and legacy-balance events.
  await ensureSyncEnvelopes();
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
