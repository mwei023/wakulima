import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLanBackupConfig,
  setLanBackupConfig,
  isLanBackupConfigured,
  pushToLanReceiver,
  runLanPushIfDue,
  getLastLanPush,
  LAN_URL_KEY,
  LAN_TOKEN_KEY,
} from './lanBackup';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LAN backup config', () => {
  it('stores and reports configuration', () => {
    expect(isLanBackupConfigured()).toBe(false);
    setLanBackupConfig('http://192.168.1.10:8787 ', ' secret ');
    expect(getLanBackupConfig()).toEqual({ url: 'http://192.168.1.10:8787', token: 'secret' });
    expect(isLanBackupConfigured()).toBe(true);
  });
});

describe('pushToLanReceiver', () => {
  it('is a no-op when unconfigured', async () => {
    expect(await pushToLanReceiver()).toMatchObject({ status: 'skipped-unconfigured' });
    expect(getLastLanPush()).toBeNull();
  });

  it('pushes the payload and records the success (and satisfies the off-device nag)', async () => {
    setLanBackupConfig('http://192.168.1.10:8787', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pushToLanReceiver();
    expect(result).toMatchObject({ status: 'pushed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://192.168.1.10:8787/backup');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-backup-token']).toBe('tok');

    const body = JSON.parse(init.body as string);
    expect(body.schema_version).toBe(3);
    expect(Array.isArray(body.products)).toBe(true);
    expect(getLastLanPush()).toMatchObject({ success: true });
    // The LAN push counts as an off-device backup: the 7-day nag must honor it.
    expect(localStorage.getItem('wakulima-last-offdevice-backup')).toBeTruthy();
  });

  it('reports a receiver error status as failed, without throwing', async () => {
    setLanBackupConfig('http://192.168.1.10:8787', 'tok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('') }));
    const result = await pushToLanReceiver();
    expect(result).toMatchObject({ status: 'failed', error: 'Receiver responded 401' });
    expect(getLastLanPush()).toMatchObject({ success: false });
  });

  it('reports a network failure as failed, without throwing', async () => {
    setLanBackupConfig('http://192.168.1.10:8787', 'tok');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('receiver is off')));
    const result = await pushToLanReceiver();
    expect(result).toMatchObject({ status: 'failed', error: 'receiver is off' });
  });
});

describe('runLanPushIfDue throttle', () => {
  it('skips a push within an hour of a successful one, then pushes again once stale', async () => {
    setLanBackupConfig('http://192.168.1.10:8787', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', fetchMock);

    expect(await runLanPushIfDue()).toMatchObject({ status: 'pushed' });

    // Immediately due-check again: must skip, no second POST.
    expect(await runLanPushIfDue()).toMatchObject({ status: 'skipped-recent' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Pretend the last success was 2h ago: due again.
    localStorage.setItem(
      'wakulima-last-lan-push',
      JSON.stringify({ success: true, at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() })
    );
    expect(await runLanPushIfDue()).toMatchObject({ status: 'pushed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still pushes after a FAILURE that happened seconds ago (data must not wait)', async () => {
    setLanBackupConfig('http://192.168.1.10:8787', 'tok');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('receiver is off'))
      .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', fetchMock);

    expect(await runLanPushIfDue()).toMatchObject({ status: 'failed' });
    // The failed attempt must NOT throttle the retry.
    expect(await runLanPushIfDue()).toMatchObject({ status: 'pushed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stays silent when no URL is configured', async () => {
    localStorage.setItem(LAN_URL_KEY, '');
    localStorage.setItem(LAN_TOKEN_KEY, '');
    expect(await runLanPushIfDue()).toMatchObject({ status: 'skipped-unconfigured' });
  });
});
