import { z } from 'zod';

/**
 * Zod schema for validating backup files before restore. Restore REPLACES the
 * live database, so a corrupt or foreign file must fail loudly here — never
 * half-apply into the tables.
 */

const isoDate = z.string().min(1);

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  selling_price: z.number().nonnegative(),
  cost_price: z.number().nonnegative(),
  stock_quantity: z.number(),
  reorder_level: z.number(),
  barcode: z.string().optional(),
  store_id: z.string().min(1),
  product_id: z.string().optional(),
  created_at: isoDate,
  updated_at: isoDate,
});

export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string(),
  credit_limit: z.number().nonnegative(),
  outstanding_balance: z.number(),
  created_at: isoDate,
});

export const saleItemSchema = z.object({
  id: z.string().min(1),
  sale_id: z.string().min(1),
  product_id: z.string().min(1),
  product_name: z.string().min(1),
  quantity: z.number(),
  unit_price: z.number().nonnegative(),
  total_line: z.number(),
});

export const saleSchema = z.object({
  id: z.string().min(1),
  customer_id: z.string().nullable(),
  total_amount: z.number().nonnegative(),
  payment_method: z.enum(['cash', 'mpesa', 'credit']),
  status: z.enum(['completed', 'voided', 'pending', 'synced']),
  timestamp: isoDate,
  store_id: z.string().min(1),
  items: z.array(saleItemSchema),
});

export const returnSchema = z.object({
  id: z.string().min(1),
  sale_id: z.string().min(1),
  product_id: z.string().min(1),
  quantity: z.number(),
  reason: z.string(),
  return_type: z.string(),
  refund_amount: z.number().nonnegative(),
  status: z.string(),
  notes: z.string(),
  created_at: isoDate,
  completed_at: z.string().nullable().optional(),
});

export const auditEntrySchema = z.object({
  id: z.string().min(1),
  user_id: z.string().nullable(),
  action: z.string(),
  table_name: z.string(),
  record_id: z.string().nullable().optional(),
  old_values: z.unknown().optional(),
  new_values: z.unknown().optional(),
  created_at: isoDate,
});

export const backupPayloadSchema = z.object({
  schema_version: z.literal(1),
  created_at: isoDate,
  products: z.array(productSchema),
  customers: z.array(customerSchema),
  sales: z.array(saleSchema),
  returns: z.array(returnSchema),
  audit: z.array(auditEntrySchema),
});
