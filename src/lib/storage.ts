/**
 * Persistent storage helpers.
 *
 * IndexedDB is evictable by default: under disk pressure the browser may wipe
 * ALL app data without asking. `navigator.storage.persist()` marks the origin
 * as persistent so eviction can't silently destroy the shop's books.
 */

export interface StorageStatus {
  persisted: boolean;
  /** True when persist() was granted or was already granted. */
  requested: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function ensurePersistentStorage(): Promise<StorageStatus> {
  let persisted = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    }
  } catch (error) {
    console.warn('storage.persist() failed:', error);
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    usageBytes = est?.usage ?? null;
    quotaBytes = est?.quota ?? null;
  } catch {
    // estimate() unsupported — status still works without numbers.
  }

  return { persisted, requested: persisted, usageBytes, quotaBytes };
}

export async function getStorageStatus(): Promise<StorageStatus> {
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    persisted = false;
  }
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    usageBytes = est?.usage ?? null;
    quotaBytes = est?.quota ?? null;
  } catch {
    // ignore
  }
  return { persisted, requested: persisted, usageBytes, quotaBytes };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
