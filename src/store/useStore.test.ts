import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/store/useStore';
import { db } from '@/lib/db';

async function clearDb() {
  await db.transaction('rw', [db.localProducts, db.localCustomers, db.localSales, db.localReturns, db.localAudit], async () => {
    await db.localProducts.clear();
    await db.localCustomers.clear();
    await db.localSales.clear();
    await db.localReturns.clear();
    await db.localAudit.clear();
  });
}

beforeEach(async () => {
  await clearDb();
  useStore.setState({ cart: [], selectedCustomer: null });
  await useStore.getState().loadData();
});

describe('store checkout', () => {
  it('loads catalog, customers and store id', () => {
    const s = useStore.getState();
    expect(s.products.length).toBeGreaterThan(0);
    expect(s.customers.length).toBeGreaterThan(0);
    expect(s.currentStoreId).toBeTruthy();
    expect(s.selectedCustomer).toBeTruthy();
  });

  it('completes a cash sale: clears cart, decrements stock, records sale', async () => {
    const s = useStore.getState();
    const product = s.products[0];
    const before = product.stock_quantity;

    s.addToCart(product, 2);
    expect(useStore.getState().cart).toHaveLength(1);

    const error = await useStore.getState().completeSale('cash');
    expect(error).toBeNull();

    const after = useStore.getState();
    expect(after.cart).toHaveLength(0);
    expect(after.sales).toHaveLength(1);
    expect(after.sales[0].total_amount).toBe(product.selling_price * 2);
    expect(after.products.find(p => p.id === product.id)!.stock_quantity).toBe(before - 2);
  });

  it('blocks credit sales for walk-in customers', async () => {
    const s = useStore.getState();
    const walkIn = s.customers.find(c => c.id === 'walk-in')!;
    s.setSelectedCustomer(walkIn);
    s.addToCart(s.products[0], 1);

    const error = await useStore.getState().completeSale('credit');
    expect(error).toMatch(/registered customer/);
    expect(useStore.getState().cart).toHaveLength(1); // cart kept
  });

  it('blocks sales beyond available stock', async () => {
    const s = useStore.getState();
    const product = s.products[0];
    s.addToCart(product, product.stock_quantity + 5);

    const error = await useStore.getState().completeSale('cash');
    expect(error).toMatch(/Insufficient stock/);
    expect(useStore.getState().sales).toHaveLength(0);
  });

  it('confirms a pending order into a credit sale', async () => {
    const s = useStore.getState();
    const order = s.pendingOrders.find(o => o.status === 'pending' && o.assigned_customer_id)!;
    const product = s.products[0];

    await useStore.getState().confirmOrder(order.id, [{ productId: product.id, quantity: 1 }]);

    const after = useStore.getState();
    expect(after.pendingOrders.find(o => o.id === order.id)!.status).toBe('confirmed');
    expect(after.sales).toHaveLength(1);
    expect(after.sales[0].payment_method).toBe('credit');
  });
});
