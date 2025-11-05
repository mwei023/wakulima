import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  action: string;
  table_name: string;
  record_id?: string;
  old_values?: any;
  new_values?: any;
}

/**
 * Create an audit log entry
 * @param entry - The audit log entry details
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('Audit log: No authenticated user');
      return;
    }

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: entry.action,
        table_name: entry.table_name,
        record_id: entry.record_id,
        old_values: entry.old_values,
        new_values: entry.new_values,
        ip_address: null, // Could be captured via edge function
        user_agent: navigator.userAgent
      });

    if (error) {
      console.error('Failed to create audit log:', error);
    }
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * Log a sale transaction
 */
export async function logSaleTransaction(saleId: string, saleData: any) {
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
    table_name: 'store_inventory',
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
    table_name: 'products_master',
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
    table_name: 'user_roles',
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
