import { liveQuery } from 'dexie';
import { db } from '@/lib/db';
import { useStore } from '@/store/useStore';
import type { Product, Customer, Sale } from '@/types';

/**
 * Keeps the store's products/customers/sales in lockstep with IndexedDB using
 * Dexie liveQuery. Any write — this tab, another tab, or a future sync spine —
 * re-renders every surface reading the store instead of showing stale stock.
 *
 * Dexie 4 propagates changes across tabs of the same origin automatically
 * (BroadcastChannel under the hood), so wiring here covers multi-tab too.
 *
 * Idempotent: safe to call twice (the second call is a no-op).
 * Returns a disposer (mostly for tests).
 */
let unsubscribe: (() => void) | null = null;

export function startLiveSync(): () => void {
  if (unsubscribe) return unsubscribe;

  const setProducts = (p: Product[]) => useStore.setState({ products: p });
  const setCustomers = (c: Customer[]) => useStore.setState({ customers: c });
  const setSales = (s: Sale[]) =>
    useStore.setState({ sales: [...s].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) });

  const subProducts = liveQuery(() => db.localProducts.toArray()).subscribe({
    next: setProducts,
    error: err => console.error('liveSync products:', err),
  });
  const subCustomers = liveQuery(() => db.localCustomers.toArray()).subscribe({
    next: setCustomers,
    error: err => console.error('liveSync customers:', err),
  });
  const subSales = liveQuery(() => db.localSales.toArray()).subscribe({
    next: setSales,
    error: err => console.error('liveSync sales:', err),
  });

  unsubscribe = () => {
    subProducts.unsubscribe();
    subCustomers.unsubscribe();
    subSales.unsubscribe();
    unsubscribe = null;
  };
  return unsubscribe;
}
