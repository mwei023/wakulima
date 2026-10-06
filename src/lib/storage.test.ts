import { describe, it, expect, vi } from 'vitest';
import { ensurePersistentStorage, getStorageStatus, formatBytes } from './storage';

describe('persistent storage', () => {
  it('reports persisted=true when the browser grants persistence', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({ usage: 1024 * 512, quota: 1024 * 1024 * 100 }),
      },
    });

    const status = await ensurePersistentStorage();
    expect(status.persisted).toBe(true);
    expect(status.requested).toBe(true);
    expect(status.usageBytes).toBe(1024 * 512);

    const status2 = await getStorageStatus();
    expect(status2.persisted).toBe(true);

    vi.unstubAllGlobals();
  });

  it('still works when the Storage API is missing (older browsers)', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });

    const status = await ensurePersistentStorage();
    expect(status.persisted).toBe(false);
    expect(status.usageBytes).toBeNull();

    vi.unstubAllGlobals();
  });

  it('formats byte counts for display', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024 * 3.5)).toBe('3.5 KB');
    expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 1.2)).toBe('1.2 GB');
  });
});
