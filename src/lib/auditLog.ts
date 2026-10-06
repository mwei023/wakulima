import { db, addAudit } from '@/lib/db';

export interface AuditLogEntry {
  action: string;
  table_name: string;
  record_id?: string;
  old_values?: unknown;
  new_values?: unknown;
}

/**
 * Create a local audit log entry (IndexedDB).
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await addAudit(entry.action, entry.table_name, entry.record_id, entry.new_values, null, entry.old_values);
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/** Local audit trail for the Admin view. */
export async function getAuditLogs(limit = 500) {
  return db.localAudit.orderBy('created_at').reverse().limit(limit).toArray();
}

/**
 * Log a sale transaction
 */
export async function logSaleTransaction(saleId: string, saleData: unknown) {
  await createAuditLog({
    action: 'CREATE_SALE',
    table_name: 'sales',
    record_id: saleId,
    new_values: saleData
  });
}

/**
 * Log inventory update
 */
export async function logInventoryUpdate(productId: string, oldQuantity: number, newQuantity: number) {
  await createAuditLog({
    action: 'UPDATE_INVENTORY',
    table_name: 'products',
    record_id: productId,
    old_values: { stock_quantity: oldQuantity },
    new_values: { stock_quantity: newQuantity }
  });
}

/**
 * Log price change
 */
export async function logPriceChange(productId: string, oldPrice: number, newPrice: number) {
  await createAuditLog({
    action: 'UPDATE_PRICE',
    table_name: 'products',
    record_id: productId,
    old_values: { selling_price: oldPrice },
    new_values: { selling_price: newPrice }
  });
}

/**
 * Log user role assignment
 */
export async function logRoleAssignment(userId: string, role: string) {
  await createAuditLog({
    action: 'ASSIGN_ROLE',
    table_name: 'users',
    record_id: userId,
    new_values: { role }
  });
}

/**
 * Log data export
 */
export async function logDataExport(tableName: string, recordCount: number) {
  await createAuditLog({
    action: 'EXPORT_DATA',
    table_name: tableName,
    new_values: { record_count: recordCount }
  });
}
