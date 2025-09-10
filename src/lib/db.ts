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

  // Sync queued sales (mock implementation)
  async syncQueuedSales() {
    const pendingSales = await db.queuedSales.where('synced').equals(0).toArray();
    
    for (const queuedSale of pendingSales) {
      try {
        // Mock API call - in real implementation, send to FastAPI backend
        console.log('Syncing sale:', queuedSale.saleData);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mark as synced
        await db.queuedSales.update(queuedSale.id!, { synced: true });
      } catch (error) {
        console.error('Failed to sync sale:', error);
        // Keep in queue for retry
        break;
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
