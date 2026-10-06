/**
 * Tracks the last time a full JSON backup was DOWNLOADED (off-device).
 * A rolling on-device snapshot is not a backup — the device can be lost,
 * stolen, or wiped. The UI shows a nag when the off-device copy is stale.
 */

const LAST_EXPORT_KEY = 'wakulima-last-offdevice-backup';
export const BACKUP_NAG_DAYS = 7;

export function getLastOffDeviceBackup(): string | null {
  try {
    return localStorage.getItem(LAST_EXPORT_KEY);
  } catch {
    return null;
  }
}

export function markManualExport(): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  } catch {
    // Private mode etc. — the nag simply stays visible, which is safe.
  }
}

export function daysSinceLastOffDeviceBackup(): number | null {
  const last = getLastOffDeviceBackup();
  if (!last) return null;
  const ms = Date.now() - new Date(last).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function shouldNagForBackup(): boolean {
  const days = daysSinceLastOffDeviceBackup();
  return days === null || days >= BACKUP_NAG_DAYS;
}
