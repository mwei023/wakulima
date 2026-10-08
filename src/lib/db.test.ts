import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedLocal, processLocalSale, createLocalReturn, updateLocalReturnStatus, getLocalReturns, addAudit, getAudit, voidLocalSale } from '@/lib/db';
import { STORE_ID } from '@/lib/backend';

async function clearAll() {
  await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit], async () => {
    await db.localProducts.clear();
    await db.localCustomers.clear();
    await db.localSales.clear();
    await db.localReturns.clear();
    await db.localAudit.clear();
  });
}

beforeEach(async () => {
  await clearAll();
  await seedLocal();
});

describe('seedLocal', () => {
  it('seeds products and customers once', async () => {
    expect(await db.localProducts.count()).toBeGreaterThan(0);
    expect(await db.localCustomers.count()).toBeGreaterThan(0);
    const products = await db.localProducts.toArray();
    expect(products.every(p => p.store_id === STORE_ID)).toBe(true);

    // Second call does not duplicate
    await seedLocal();
    expect(await db.localProducts.count()).toBe(products.length);
  });
});

describe('processLocalSale', () => {
  it('completes a cash sale and decrements stock', async () => {
    const product = (await db.localProducts.toArray())[0];
    const before = product.stock_quantity;

    const saleId = await processLocalSale(
      STORE_ID,
      null,
      'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: product.selling_price, total_line: product.selling_price * 2 }],
      product.selling_price * 2
    );

    expect(saleId).toBeTruthy();
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(before - 2);
    const sale = await db.localSales.get(saleId);
    expect(sale).toBeDefined();
    expect(sale!.items).toHaveLength(1);
    expect(sale!.items[0].sale_id).toBe(saleId);
  });

  it('rejects when stock is insufficient and changes nothing', async () => {
    const product = (await db.localProducts.toArray())[0];
    const before = product.stock_quantity;

    await expect(
      processLocalSale(
        STORE_ID,
        null,
        'cash',
        [{ product_id: product.id, product_name: product.name, quantity: before + 10, unit_price: product.selling_price, total_line: 0 }],
        0
      )
    ).rejects.toThrow(/Insufficient stock/);

    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(before);
    expect(await db.localSales.count()).toBe(0);
  });

  it('rejects credit sales over the limit without touching stock', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in' && c.credit_limit > 0)!;
    const before = product.stock_quantity;

    await expect(
      processLocalSale(
        STORE_ID,
        customer.id,
        'credit',
        [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 1, total_line: 1 }],
        customer.credit_limit - customer.outstanding_balance + 100
      )
    ).rejects.toThrow(/credit limit/);

    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(before);
  });

  it('rejects credit sales for walk-in customers', async () => {
    const product = (await db.localProducts.toArray())[0];
    await expect(
      processLocalSale(STORE_ID, 'walk-in', 'credit',
        [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 1, total_line: 1 }],
        1)
    ).rejects.toThrow(/registered customer/);
  });

  it('adds to customer balance on credit sale', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    const before = customer.outstanding_balance;

    await processLocalSale(
      STORE_ID,
      customer.id,
      'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 100, total_line: 100 }],
      100
    );

    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(before + 100);
  });
});

describe('returns restock', () => {
  it('restocks the product once when a refund completes', async () => {
    const product = (await db.localProducts.toArray())[0];
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 3, unit_price: product.selling_price, total_line: 0 }],
      0
    );
    const afterSale = (await db.localProducts.get(product.id))!.stock_quantity;

    const ret = await createLocalReturn({
      sale_id: saleId,
      product_id: product.id,
      quantity: 3,
      reason: 'defective',
      return_type: 'refund',
      notes: ''
    });

    // Refund is computed from what was actually paid, not the caller's word.
    expect(ret.refund_amount).toBe(product.selling_price * 3);

    await updateLocalReturnStatus(ret.id, 'approved');
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(afterSale); // no restock yet

    await updateLocalReturnStatus(ret.id, 'completed');
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(afterSale + 3);

    // Completing twice must be rejected, not double-restock or double-refund
    await expect(updateLocalReturnStatus(ret.id, 'completed')).rejects.toThrow(/already been completed/);
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(afterSale + 3);

    expect(await getLocalReturns()).toHaveLength(1);
  });
});

describe('returns validation', () => {
  it('rejects returning a product not in the sale', async () => {
    const [product, other] = (await db.localProducts.toArray()).slice(0, 2);
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: 0 }],
      0
    );

    await expect(
      createLocalReturn({ sale_id: saleId, product_id: other.id, quantity: 1, reason: 'x', return_type: 'refund', notes: '' })
    ).rejects.toThrow(/not purchased/);
  });

  it('rejects returning more than was purchased and caps repeat returns', async () => {
    const product = (await db.localProducts.toArray())[0];
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: product.selling_price, total_line: 0 }],
      0
    );

    await expect(
      createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 3, reason: 'x', return_type: 'refund', notes: '' })
    ).rejects.toThrow(/still returnable/);

    const first = await createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 1, reason: 'x', return_type: 'refund', notes: '' });
    await expect(
      createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 2, reason: 'x', return_type: 'refund', notes: '' })
    ).rejects.toThrow(/still returnable/); // only 1 left after the first return

    // A rejected return frees its units back up
    await updateLocalReturnStatus(first.id, 'rejected');
    const retried = await createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 2, reason: 'y', return_type: 'refund', notes: '' });
    expect(retried.quantity).toBe(2);
  });
});

describe('returns money reversal', () => {
  it('reduces the customer balance when a credit-sale refund completes', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    const before = customer.outstanding_balance;

    const saleId = await processLocalSale(
      STORE_ID, customer.id, 'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: 100, total_line: 200 }],
      200
    );
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(before + 200);

    const ret = await createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 1, reason: 'x', return_type: 'refund', notes: '' });
    expect(ret.refund_amount).toBe(100); // sale price, not catalog price

    await updateLocalReturnStatus(ret.id, 'approved');
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(before + 200); // unchanged until completed

    await updateLocalReturnStatus(ret.id, 'completed');
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(before + 100);
  });

  it('does not touch customer balance for cash-sale refunds or exchanges', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    const before = customer.outstanding_balance;

    const saleId = await processLocalSale(
      STORE_ID, customer.id, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 100, total_line: 100 }],
      100
    );

    const ret = await createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 1, reason: 'x', return_type: 'exchange', notes: '' });
    await updateLocalReturnStatus(ret.id, 'completed');
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(before);
  });
});

describe('voidLocalSale', () => {
  it('restocks items, reverses credit balance, marks voided, and audits', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    const stockBefore = product.stock_quantity;
    const balanceBefore = customer.outstanding_balance;

    const saleId = await processLocalSale(
      STORE_ID, customer.id, 'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: 100, total_line: 200 }],
      200
    );
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(stockBefore - 2);
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(balanceBefore + 200);

    await voidLocalSale(saleId, 'wrong items entered', null);

    expect((await db.localSales.get(saleId))!.status).toBe('voided');
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(stockBefore); // fully restocked
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(balanceBefore); // credit reversed
    const logs = await getAudit();
    const voidEntry = logs.find(l => l.action === 'void_sale');
    expect(voidEntry).toBeDefined();
    expect(voidEntry!.record_id).toBe(saleId);
    expect((voidEntry!.new_values as { reason: string }).reason).toBe('wrong items entered');
  });

  it('restocks cash sales without touching any customer balance', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    const balanceBefore = customer.outstanding_balance;

    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
      product.selling_price
    );
    const afterSale = (await db.localProducts.get(product.id))!.stock_quantity;

    await voidLocalSale(saleId, 'test', null);
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(afterSale + 1);
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(balanceBefore);
  });

  it('rejects double-void and leaves restock totals unchanged', async () => {
    const product = (await db.localProducts.toArray())[0];
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
      product.selling_price
    );
    await voidLocalSale(saleId, 'first', null);
    const restocked = (await db.localProducts.get(product.id))!.stock_quantity;

    await expect(voidLocalSale(saleId, 'second', null)).rejects.toThrow(/already been voided/);
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(restocked); // no double restock
  });

  it('rejects when the sale does not exist', async () => {
    await expect(voidLocalSale('nonexistent-sale', 'x', null)).rejects.toThrow(/Sale not found/);
  });

  it('two overlapping sales for the last unit: one fails cleanly', async () => {
    const product = (await db.localProducts.toArray())[0];
    // Force the stock down to exactly one unit.
    await db.localProducts.update(product.id, { stock_quantity: 1 });

    const line = [
      {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.selling_price,
        total_line: product.selling_price,
      },
    ];

    // Both transactions start together; the loser must throw and change nothing.
    const results = await Promise.allSettled([
      processLocalSale(STORE_ID, null, 'cash', line, product.selling_price),
      processLocalSale(STORE_ID, null, 'cash', line, product.selling_price),
    ]);

    const winners = results.filter(r => r.status === 'fulfilled');
    const losers = results.filter(r => r.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ message: /Insufficient stock/ });

    // Database ends in the correct state: exactly one sale, stock at zero.
    expect(await db.localSales.count()).toBe(1);
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(0);
  });

  it('blocks returns against a voided sale', async () => {
    const product = (await db.localProducts.toArray())[0];
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.selling_price, total_line: product.selling_price }],
      product.selling_price
    );
    await voidLocalSale(saleId, 'voided before return', null);

    await expect(
      createLocalReturn({ sale_id: saleId, product_id: product.id, quantity: 1, reason: 'x', return_type: 'refund', notes: '' })
    ).rejects.toThrow(/voided sale/);
  });
});

describe('audit trail', () => {
  it('records entries in order', async () => {
    await addAudit('CREATE_SALE', 'sales', 'sale-1', { total: 100 });
    await addAudit('UPDATE_PRICE', 'products', 'prod-1', { selling_price: 200 }, null, { selling_price: 150 });
    const logs = await getAudit();
    expect(logs).toHaveLength(2);
    expect(logs[0].action).toBe('UPDATE_PRICE'); // newest first
    expect(logs[1].record_id).toBe('sale-1');
  });
});

describe('1.4 invariants: credit boundary, terminal states, net restock, audit', () => {
  it('allows a credit sale exactly at the limit, rejects one cent over', async () => {
    const product = (await db.localProducts.toArray())[0];
    const customer = (await db.localCustomers.toArray()).find(c => c.id !== 'walk-in')!;
    // Deterministic values: limit 500, balance 200 → headroom exactly 300.
    await db.localCustomers.update(customer.id, { credit_limit: 50000, outstanding_balance: 20000 });
    const before = product.stock_quantity;

    // Exactly at the headroom (300) must SUCCEED — the boundary is inclusive.
    const saleId = await processLocalSale(
      STORE_ID, customer.id, 'credit',
      [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 30000, total_line: 30000 }],
      30000
    );
    expect(saleId).toBeTruthy();
    expect((await db.localCustomers.get(customer.id))!.outstanding_balance).toBe(50000);
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(before - 1);

    // Now sitting exactly at the limit: one more cent of credit must fail.
    await expect(
      processLocalSale(
        STORE_ID, customer.id, 'credit',
        [{ product_id: product.id, product_name: product.name, quantity: 1, unit_price: 1, total_line: 1 }],
        1
      )
    ).rejects.toThrow(/credit limit/);
  });

  it('rejected returns are terminal: they cannot be completed afterwards', async () => {
    const product = (await db.localProducts.toArray())[0];
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: product.selling_price, total_line: 0 }],
      0
    );
    const ret = await createLocalReturn({
      sale_id: saleId, product_id: product.id, quantity: 1,
      reason: 'x', return_type: 'refund', notes: ''
    });
    await updateLocalReturnStatus(ret.id, 'rejected');

    const stockAfterReject = (await db.localProducts.get(product.id))!.stock_quantity;
    await expect(updateLocalReturnStatus(ret.id, 'completed')).rejects.toThrow(/rejected and cannot be completed/);
    expect((await db.localReturns.get(ret.id))!.status).toBe('rejected');
    // The failed completion must not have restocked anything.
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(stockAfterReject);
  });

  it('void restocks only the net when a completed return already put units back', async () => {
    const product = (await db.localProducts.toArray())[0];
    const stockBefore = product.stock_quantity;

    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 5, unit_price: product.selling_price, total_line: 0 }],
      0
    );
    const afterSale = (await db.localProducts.get(product.id))!.stock_quantity; // stockBefore - 5

    // 2 units come back via a completed return.
    const ret = await createLocalReturn({
      sale_id: saleId, product_id: product.id, quantity: 2,
      reason: 'x', return_type: 'refund', notes: ''
    });
    await updateLocalReturnStatus(ret.id, 'completed');
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(afterSale + 2);

    // Void must restock only the remaining 3 — restocking all 5 would
    // conjure 2 units from nothing.
    await voidLocalSale(saleId, 'cashier error', null);
    expect((await db.localProducts.get(product.id))!.stock_quantity).toBe(stockBefore);
  });

  it('records a create_sale audit entry for every sale, with the acting user', async () => {
    const product = (await db.localProducts.toArray())[0];
    const saleId = await processLocalSale(
      STORE_ID, null, 'cash',
      [{ product_id: product.id, product_name: product.name, quantity: 2, unit_price: 100, total_line: 200 }],
      200, undefined, 'user-123'
    );
    const entry = (await getAudit()).find(l => l.action === 'create_sale' && l.record_id === saleId);
    expect(entry).toBeDefined();
    expect(entry!.user_id).toBe('user-123');
    expect(entry!.table_name).toBe('sales');
    expect(entry!.new_values).toMatchObject({ total: 200, method: 'cash', items: 1 });
  });
});
