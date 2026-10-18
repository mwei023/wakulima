import { ensurePersistentStorage } from './storage';
import { runRollingBackupIfDue, latestBackupMeta } from './backup';
import { runLanPushIfDue } from './lanBackup';

let started = false;

/**
 * Runs once per app load: request persistent storage (never evict the books)
 * and take a rolling snapshot if the last one is stale. Also re-checks when
 * the tab regains visibility — the till may sit open for days.
 */
export function startDataSafety(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const maybeBackup = () => {
    runRollingBackupIfDue();
    // LAN receiver push (ADR-001): throttled, never blocks, failure is a
    // status line in Settings — the source of truth stays local either way.
    void runLanPushIfDue().then(result => {
      if (result.status === 'failed') {
        console.warn('LAN backup push failed (will retry next cycle):', result.error);
      }
    });
  };

  void ensurePersistentStorage().then(status => {
    if (!status.persisted) {
      console.warn(
        'Storage persistence NOT granted — the browser may evict app data under disk pressure. ' +
        'Install the app as a PWA or grant persistent storage to protect sales data.'
      );
    }
  });

  // Initial backup check once the DOM is live (Dexie is ready immediately).
  maybeBackup();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeBackup();
  });
}

export { latestBackupMeta };
