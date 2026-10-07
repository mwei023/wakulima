import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  seedLocal,
  processLocalSale,
  nextSeq,
  RECEIPT_SEQ_KEY,
} from '@/lib/db';
import { STORE_ID } from '@/lib/backend';
import { kesToCents, centsToKes, formatCurrency } from '@/lib/utils';

async function clearAll() {
  await db.transaction(
    'rw',
    [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit, db.localMeta],
    async () => {
      await db.localProducts.clear();
      await db.localCustomers.clear();
      await db.localSales.clear();
      await db.localReturns.clear();
      await db.localAudit.clear();
      await db.localMeta.clear();
    }
  );
}

beforeEach(async () => {
  await clearAll();
  await seedLocal();
});

describe('integer-cents money', () => {
  it('never uses binary fraction: 0.10 + 0.10 + 0.10 is exactly 30 cents', async () => {
    const product = (await db.localProducts.toArray())[0];
    await db.localProducts.update(product.id, { selling_price: 10 }); // KES 0.10

    const saleId = await processLocalSale(
      STORE_ID,
      null,
      'cash',
      [
        { product_id: product.id, product_name: product.name, quantity: 3, unit_price: 10, total_line: 30 },
      ],
      30 // total equals the line sum exactly
    );

    const sale = (await db.localSales.get(saleId))!;
    expect(sale.total_amount).toBe(30); // exact integer, not 30.000000000000004
    expect(sale.items[0].total_line).toBe(30);
    expect(Number.isInteger(sale.total_amount)).toBe(true);
  });

  it('kesToCents and centsToKes round-trip fractions of a shilling', () => {
    expect(kesToCents(0.1 + 0.2)).toBe(30); // float noise killed at the boundary
    expect(kesToCents('1499.99')).toBe(149999);
    expect(centsToKes(149999)).toBeCloseTo(1499.99, 10);
    expect(formatCurrency(149999)).toMatch(/1,499\.99/);
    expect(formatCurrency(350000)).toMatch(/3,500/); // whole shillings stay clean
  });
});

describe('M-Pesa reference handling', () => {
  it('rejects an mpesa sale without a reference and stores a trimmed one', async () => {
    const product = (await db.localProducts.toArray())[0];

    await expect(
      processLocalSale(
        STORE_ID,
        null,
        'mpesa',
        [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
        product.selling_price
      )
    ).rejects.toThrow(/M-Pesa reference is required/);

    const saleId = await processLocalSale(
      STORE_ID,
      null,
      'mpesa',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
      product.selling_price,
      '  QGH7X2M9NP  '
    );
    const sale = (await db.localSales.get(saleId))!;
    expect(sale.mpesa_reference).toBe('QGH7X2M9NP');
  });

  it('rejects references longer than 32 characters', async () => {
    const product = (await db.localProducts.toArray())[0];
    await expect(
      processLocalSale(
        STORE_ID,
        null,
        'mpesa',
        [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
        product.selling_price,
        'x'.repeat(33)
      )
    ).rejects.toThrow(/32 characters or fewer/);
  });
});

describe('sequential receipt numbers', () => {
  it('assigns 1, 2, 3... across sales and persists the counter', async () => {
    const product = (await db.localProducts.toArray())[0];
    const line = [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }];

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await processLocalSale(STORE_ID, null, 'cash', line, product.selling_price));
    }

    const numbers = await Promise.all(ids.map(async id => (await db.localSales.get(id))!.receipt_number));
    expect(numbers).toEqual([1, 2, 3]);

    expect(await nextSeq(RECEIPT_SEQ_KEY)).toBe(4);
    expect((await db.localMeta.get(RECEIPT_SEQ_KEY))!.value).toBe(4);
  });
});
