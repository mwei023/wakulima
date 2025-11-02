import Dexie, { Table } from 'dexie';
import { Product, Customer, Sale, SyncStatus } from '@/types';

interface OfflineData {
  id?: number;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  syncStatus: SyncStatus;
  lastUpdated: string;
}

interface QueuedSale {
  id?: number;
  saleData: Sale;
  timestamp: string;
  synced: boolean;
}

class OfflineDatabase extends Dexie {
  offlineData!: Table<OfflineData>;
  queuedSales!: Table<QueuedSale>;

  constructor() {
    super('WakulimaAgrovetDB');
    this.version(1).stores({
      offlineData: '++id, lastUpdated',
      queuedSales: '++id, timestamp, synced'
    });
  }
}

export const db = new OfflineDatabase();

// Network status management
export class OfflineManager {
  private static instance: OfflineManager;
  private isOnline: boolean = navigator.onLine;
  private listeners: ((isOnline: boolean) => void)[] = [];

  static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  constructor() {
    window.addEventListener('online', () => this.setOnlineStatus(true));
    window.addEventListener('offline', () => this.setOnlineStatus(false));
  }

  private setOnlineStatus(status: boolean) {
    this.isOnline = status;
    this.listeners.forEach(listener => listener(status));
    if (status) {
      this.syncQueuedSales();
    }
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  addStatusListener(listener: (isOnline: boolean) => void) {
    this.listeners.push(listener);
  }

  removeStatusListener(listener: (isOnline: boolean) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Cache data offline
  async cacheData(products: Product[], customers: Customer[], sales: Sale[], syncStatus: SyncStatus) {
    await db.offlineData.clear();
    await db.offlineData.add({
      products,
      customers,
      sales,
      syncStatus,
      lastUpdated: new Date().toISOString()
    });
  }

  // Load cached data
  async loadCachedData(): Promise<OfflineData | null> {
    const data = await db.offlineData.orderBy('lastUpdated').last();
    return data || null;
  }

  // Queue sale for sync when online
  async queueSale(sale: Sale) {
    await db.queuedSales.add({
      saleData: sale,
      timestamp: new Date().toISOString(),
      synced: false
    });
  }

  // Get pending sales count
  async getPendingSalesCount(): Promise<number> {
    return await db.queuedSales.where('synced').equals(0).count();
  }

  // Sync queued sales to Supabase
  async syncQueuedSales() {
    const pendingSales = await db.queuedSales.where('synced').equals(0).toArray();
    
    // Import supabase dynamically to avoid circular deps
    const { supabase } = await import('@/integrations/supabase/client');
    
    for (const queuedSale of pendingSales) {
      try {
        const sale = queuedSale.saleData;
        
        // Insert sale into Supabase
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .insert({
            customer_id: sale.customer_id,
            total_amount: sale.total_amount,
            payment_method: sale.payment_method,
            status: 'synced',
            timestamp: sale.timestamp,
            store_id: sale.store_id
          })
          .select()
          .single();

        if (saleError) throw saleError;

        // Insert sale items
        const saleItemsToInsert = sale.items.map(item => ({
          sale_id: saleData.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_line: item.total_line
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItemsToInsert);

        if (itemsError) throw itemsError;

        // Update stock quantities in store_inventory
        for (const item of sale.items) {
          const { data: currentProduct, error: fetchError } = await supabase
            .from('store_inventory')
            .select('stock_quantity')
            .eq('id', item.product_id)
            .single();

          if (fetchError) throw fetchError;

          const newStock = currentProduct.stock_quantity - item.quantity;
          const { error: stockError } = await supabase
            .from('store_inventory')
            .update({ stock_quantity: newStock })
            .eq('id', item.product_id);

          if (stockError) throw stockError;
        }

        // Update customer balance if credit
        if (sale.payment_method === 'credit' && sale.customer_id) {
          const { data: customer, error: fetchCustomerError } = await supabase
            .from('customers')
            .select('outstanding_balance')
            .eq('id', sale.customer_id)
            .single();

          if (fetchCustomerError) throw fetchCustomerError;

          const { error: customerError } = await supabase
            .from('customers')
            .update({
              outstanding_balance: customer.outstanding_balance + sale.total_amount
            })
            .eq('id', sale.customer_id);

          if (customerError) throw customerError;
        }
        
        // Mark as synced
        await db.queuedSales.update(queuedSale.id!, { synced: true });
        console.log('Successfully synced sale:', sale.id);
        
      } catch (error) {
        console.error('Failed to sync sale:', queuedSale.saleData.id, error);
        // Keep in queue for retry - continue to next sale
        continue;
      }
    }
  }

  // Manual sync trigger
  async forcSync(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot sync while offline');
    }
    await this.syncQueuedSales();
  }
}

export const offlineManager = OfflineManager.getInstance();
