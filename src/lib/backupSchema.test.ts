import { describe, it, expect } from 'vitest';
import { backupPayloadSchema } from './backupSchema';
import type { BackupPayload } from './backup';

const validPayload: BackupPayload = {
  schema_version: 1,
  created_at: '2026-09-29T10:00:00.000Z',
  products: [{
    id: 'p1', name: 'Fertilizer', category: 'Agrochemicals', unit: 'kg',
    selling_price: 500, cost_price: 350, stock_quantity: 10, reorder_level: 5,
    store_id: 'main-store', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }],
  customers: [{
    id: 'c1', name: 'Juma', phone: '0722', credit_limit: 1000,
    outstanding_balance: 0, created_at: '2026-01-01T00:00:00.000Z',
  }],
  sales: [{
    id: 's1', customer_id: null, total_amount: 500, payment_method: 'cash',
    status: 'pending', timestamp: '2026-09-29T10:00:00.000Z', store_id: 'main-store',
    items: [{ id: 'i1', sale_id: 's1', product_id: 'p1', product_name: 'Fertilizer', quantity: 1, unit_price: 500, total_line: 500 }],
  }],
  returns: [],
  audit: [],
};

describe('backup payload schema', () => {
  it('accepts a valid payload', () => {
    expect(backupPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('accepts both supported versions (1 legacy KES floats, 2 cents)', () => {
    expect(backupPayloadSchema.safeParse({ ...validPayload, schema_version: 1 }).success).toBe(true);
    expect(backupPayloadSchema.safeParse({ ...validPayload, schema_version: 2 }).success).toBe(true);
  });

  it('rejects unknown schema versions', () => {
    const bad = { ...validPayload, schema_version: 3 };
    expect(backupPayloadSchema.safeParse(bad).success).toBe(false);
    const zero = { ...validPayload, schema_version: 0 };
    expect(backupPayloadSchema.safeParse(zero).success).toBe(false);
  });

  it('rejects missing tables and corrupt records', () => {
    expect(backupPayloadSchema.safeParse({ ...validPayload, products: undefined }).success).toBe(false);
    const badSale = JSON.parse(JSON.stringify(validPayload));
    badSale.sales[0].total_amount = 'free';
    expect(backupPayloadSchema.safeParse(badSale).success).toBe(false);
  });

  it('rejects non-object junk', () => {
    expect(backupPayloadSchema.safeParse('hello').success).toBe(false);
    expect(backupPayloadSchema.safeParse(null).success).toBe(false);
  });
});
