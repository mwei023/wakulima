import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLastOffDeviceBackup,
  markManualExport,
  daysSinceLastOffDeviceBackup,
  shouldNagForBackup,
  BACKUP_NAG_DAYS,
} from './backupReminder';

beforeEach(() => {
  localStorage.clear();
});

describe('backup reminder', () => {
  it('nags when no off-device backup was ever taken', () => {
    expect(getLastOffDeviceBackup()).toBeNull();
    expect(daysSinceLastOffDeviceBackup()).toBeNull();
    expect(shouldNagForBackup()).toBe(true);
  });

  it('stops nagging right after an export and resumes after the window', () => {
    markManualExport();
    expect(shouldNagForBackup()).toBe(false);
    expect(daysSinceLastOffDeviceBackup()).toBe(0);

    // Simulate the marker aging past the nag window.
    const stale = new Date(Date.now() - (BACKUP_NAG_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('wakulima-last-offdevice-backup', stale);
    expect(daysSinceLastOffDeviceBackup()).toBe(BACKUP_NAG_DAYS + 1);
    expect(shouldNagForBackup()).toBe(true);
  });

  it('treats a garbage marker as never-backed-up', () => {
    localStorage.setItem('wakulima-last-offdevice-backup', 'not-a-date');
    expect(daysSinceLastOffDeviceBackup()).toBeNull();
    expect(shouldNagForBackup()).toBe(true);
  });
});
