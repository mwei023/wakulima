import { createBackupPayload } from './backup';
import { markLanPush } from './backupReminder';

/**
 * LAN backup push (ADR-001, Phase 2.1).
 *
 * The full-snapshot design makes retry trivial and gap-free: the payload is
 * always a complete snapshot of the current database, so a failed push loses
 * nothing — the next successful push simply carries newer data. "Queue" is
 * therefore the throttle state, not a message queue.
 *
 * Config lives in localStorage so the shop owner can set it once in Settings:
 *   wakulima-lan-backup-url    e.g. http://192.168.1.10:8787
 *   wakulima-lan-backup-token  must match the receiver's BACKUP_TOKEN
 */

export const LAN_URL_KEY = 'wakulima-lan-backup-url';
export const LAN_TOKEN_KEY = 'wakulima-lan-backup-token';
const LAST_LAN_SUCCESS_KEY = 'wakulima-last-lan-push';
const LAN_MIN_INTERVAL_MS = 60 * 60 * 1000; // push at most hourly unless forced

export function getLanBackupConfig(): { url: string; token: string } {
  return {
    url: (localStorage.getItem(LAN_URL_KEY) ?? '').trim(),
    token: (localStorage.getItem(LAN_TOKEN_KEY) ?? '').trim(),
  };
}

export function setLanBackupConfig(url: string, token: string): void {
  localStorage.setItem(LAN_URL_KEY, url.trim());
  localStorage.setItem(LAN_TOKEN_KEY, token.trim());
}

export function isLanBackupConfigured(): boolean {
  return getLanBackupConfig().url.length > 0;
}

export function getLastLanPush(): { success: boolean; at: string } | null {
  try {
    const raw = localStorage.getItem(LAST_LAN_SUCCESS_KEY);
    return raw ? (JSON.parse(raw) as { success: boolean; at: string }) : null;
  } catch {
    return null;
  }
}

export type LanPushResult =
  | { status: 'pushed'; at: string }
  | { status: 'skipped-unconfigured' }
  | { status: 'skipped-recent'; last: string }
  | { status: 'failed'; error: string };

/** Push the current full snapshot to the LAN receiver. Never throws. */
export async function pushToLanReceiver(): Promise<LanPushResult> {
  const { url, token } = getLanBackupConfig();
  if (!url) return { status: 'skipped-unconfigured' };

  try {
    const payload = await createBackupPayload();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${url}/backup`, {
        method: 'POST',
        headers: token ? { 'content-type': 'application/json', 'x-backup-token': token } : { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const at = new Date().toISOString();
    if (!res.ok) {
      localStorage.setItem(LAST_LAN_SUCCESS_KEY, JSON.stringify({ success: false, at, error: `Receiver responded ${res.status}` }));
      return { status: 'failed', error: `Receiver responded ${res.status}` };
    }
    localStorage.setItem(LAST_LAN_SUCCESS_KEY, JSON.stringify({ success: true, at }));
    // A push to the LAN receiver IS an off-device copy — it must satisfy the
    // 7-day download nag, otherwise the nag fights the automation.
    markLanPush();
    return { status: 'pushed', at };
  } catch (error) {
    // Record the failure with a timestamp so Settings can show "last attempt".
    const at = new Date().toISOString();
    localStorage.setItem(LAST_LAN_SUCCESS_KEY, JSON.stringify({ success: false, at, error: String(error) }));
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

/** Throttled entry point for app start / tab return. Safe to call often. */
export async function runLanPushIfDue(): Promise<LanPushResult> {
  const { url } = getLanBackupConfig();
  if (!url) return { status: 'skipped-unconfigured' };
  const last = getLastLanPush();
  if (last?.success) {
    const ageMs = Date.now() - new Date(last.at).getTime();
    if (ageMs < LAN_MIN_INTERVAL_MS) {
      return { status: 'skipped-recent', last: last.at };
    }
  }
  return pushToLanReceiver();
}
