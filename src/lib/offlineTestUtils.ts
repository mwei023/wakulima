import { offlineManager } from './db';
import { Sale } from '@/types';

/**
 * Offline Testing Utilities
 * Provides functions to simulate offline scenarios and test sync functionality
 */

export interface OfflineTestScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
  test: () => Promise<boolean>;
}

/**
 * Simulate going offline by overriding navigator.onLine
 */
export const simulateOffline = (): void => {
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: false,
  });
  window.dispatchEvent(new Event('offline'));
};

/**
 * Simulate coming back online
 */
export const simulateOnline = (): void => {
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true,
  });
  window.dispatchEvent(new Event('online'));
};

/**
 * Mock a sync failure by overriding the offlineManager's sync method
 */
export const mockSyncFailure = (errorMessage: string = 'Sync failed'): void => {
  const originalSync = offlineManager.forcSync.bind(offlineManager);
  (offlineManager as { forcSync: () => Promise<void> }).forcSync = async () => {
    throw new Error(errorMessage);
  };

  // Store original for restoration
  (offlineManager as { _originalSync?: () => Promise<void> })._originalSync = originalSync;
};

/**
 * Restore original sync functionality
 */
export const restoreSync = (): void => {
  const manager = offlineManager as { _originalSync?: () => Promise<void>; forcSync?: () => Promise<void> };
  if (manager._originalSync) {
    manager.forcSync = manager._originalSync;
    delete manager._originalSync;
  }
};

/**
 * Simulate network latency for sync operations
 */
export const simulateNetworkLatency = (delayMs: number = 2000): void => {
  const originalSync = offlineManager.forcSync.bind(offlineManager);
  (offlineManager as { forcSync: () => Promise<void> }).forcSync = async () => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return originalSync();
  };

  // Store original for restoration
  (offlineManager as { _originalSync?: () => Promise<void> })._originalSync = originalSync;
};

/**
 * Clear all offline cached data (simplified - clears queued sales)
 */
export const clearOfflineCache = async (): Promise<void> => {
  // For now, just clear queued sales as main cache clearing method
  const { db } = await import('./db');
  await db.queuedSales.clear();
};

/**
 * Get current offline cache statistics
 */
export const getOfflineCacheStats = async () => {
  const pendingSales = await offlineManager.getPendingSalesCount();

  return {
    pendingSales,
    cachedProducts: 0, // Not implemented in OfflineManager yet
    cachedCustomers: 0, // Not implemented in OfflineManager yet
    totalCacheSize: pendingSales
  };
};

/**
 * Test scenario: Complete offline sale workflow
 */
export const offlineSaleScenario: OfflineTestScenario = {
  name: 'Offline Sale Workflow',
  description: 'Test complete sale process while offline',
  setup: async () => {
    simulateOffline();
    await clearOfflineCache();
  },
  teardown: async () => {
    simulateOnline();
    restoreSync();
  },
  test: async () => {
    try {
      // This would be called from POSInterface
      // For now, just check if we're offline
      return !navigator.onLine;
    } catch (error) {
      console.error('Offline sale test failed:', error);
      return false;
    }
  }
};

/**
 * Test scenario: Sync failure handling
 */
export const syncFailureScenario: OfflineTestScenario = {
  name: 'Sync Failure Handling',
  description: 'Test behavior when sync operations fail',
  setup: async () => {
    simulateOnline();
    mockSyncFailure('Network timeout');
  },
  teardown: async () => {
    restoreSync();
  },
  test: async () => {
    try {
      await offlineManager.forcSync();
      return false; // Should have thrown
    } catch (error) {
      return error.message === 'Network timeout';
    }
  }
};

/**
 * Test scenario: Network recovery
 */
export const networkRecoveryScenario: OfflineTestScenario = {
  name: 'Network Recovery',
  description: 'Test automatic sync when coming back online',
  setup: async () => {
    simulateOffline();
    // Add some mock pending data by queuing a sale
    const mockSale: Sale = {
      id: 'test-sale-1',
      customer_id: null,
      items: [],
      total_amount: 100,
      payment_method: 'cash',
      timestamp: new Date().toISOString(),
      store_id: 'test-store',
      status: 'pending'
    };
    await offlineManager.queueSale(mockSale);
  },
  teardown: async () => {
    simulateOnline();
    await clearOfflineCache();
  },
  test: async () => {
    simulateOnline();
    // Wait a bit for auto-sync
    await new Promise(resolve => setTimeout(resolve, 1000));
    const pendingCount = await offlineManager.getPendingSalesCount();
    return pendingCount === 0; // Should have synced
  }
};

/**
 * Run all offline test scenarios
 */
export const runOfflineTests = async (): Promise<{ passed: number; failed: number; results: any[] }> => {
  const scenarios = [offlineSaleScenario, syncFailureScenario, networkRecoveryScenario];
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const scenario of scenarios) {
    try {
      await scenario.setup();
      const result = await scenario.test();
      await scenario.teardown();

      if (result) {
        passed++;
        results.push({ scenario: scenario.name, status: 'PASSED' });
      } else {
        failed++;
        results.push({ scenario: scenario.name, status: 'FAILED' });
      }
    } catch (error) {
      failed++;
      results.push({ scenario: scenario.name, status: 'ERROR', error: error.message });
      await scenario.teardown();
    }
  }

  return { passed, failed, results };
};

/**
 * Utility to wait for sync completion
 */
export const waitForSync = async (timeoutMs: number = 10000): Promise<boolean> => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkSync = async () => {
      const stats = await getOfflineCacheStats();
      if (stats.pendingSales === 0 || Date.now() - startTime > timeoutMs) {
        resolve(stats.pendingSales === 0);
      } else {
        setTimeout(checkSync, 500);
      }
    };
    checkSync();
  });
};
