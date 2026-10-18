import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Wakulima LAN backup receiver (ADR-001, Phase 2.1).
 *
 * A tiny always-on service for a computer in the shop, on the same router as
 * the till. The till POSTs its full JSON snapshot here; this is the off-device
 * copy that makes "device lost or broken" a hardware problem instead of a
 * data-loss event. Works with ZERO internet — LAN only.
 *
 * Endpoints:
 *   POST /backup   body = BackupPayload JSON, header x-backup-token
 *   GET  /latest   newest snapshot (same JSON) — for a replacement till to restore
 *   GET  /health   { ok: true }
 *
 * Storage: plain files. `latest.json` plus a timestamped snapshot per push,
 * pruned to --max-snapshots (default 30). No database, nothing to install.
 *
 * Run:  node server/backup-server.mjs
 * Env:  PORT (default 8787), BACKUP_TOKEN (required for writes),
 *       BACKUP_DIR (default ./backups)
 */

const MAX_BODY_BYTES = 64 * 1024 * 1024; // snapshots are a few MB at most

function backupToken() {
  return process.env.BACKUP_TOKEN ?? 'wakulima-lan';
}

function backupDir() {
  return process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
}

/** Minimal shape check before a snapshot is trusted to disk. */
function looksLikeBackupPayload(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const v = raw.schema_version;
  if (v !== 1 && v !== 2 && v !== 3) return false;
  for (const key of ['products', 'customers', 'sales', 'returns', 'audit']) {
    if (!Array.isArray(raw[key])) return false;
  }
  if (typeof raw.created_at !== 'string' || raw.created_at.length === 0) return false;
  return true;
}

async function pruneSnapshots(dir, maxSnapshots) {
  const files = (await fs.readdir(dir)).filter(f => /^snapshot-\d{4}-\d{2}-\d{2}.*\.json$/.test(f)).sort();
  const doomed = files.slice(0, Math.max(0, files.length - maxSnapshots));
  await Promise.all(doomed.map(f => fs.unlink(path.join(dir, f))));
}

async function listSnapshots(dir) {
  const files = (await fs.readdir(dir)).filter(f => /^snapshot-/.test(f) && f.endsWith('.json')).sort();
  return files.map(f => ({ file: f }));
}

/** Starts the server; exportable so tests can bind an ephemeral port. */
export function startBackupServer({ port = 0, backupDir: dirOverride } = {}) {
  const dir = dirOverride ?? backupDir();

  const server = http.createServer(async (req, res) => {
    const sendJson = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(200, { ok: true, service: 'wakulima-lan-backup' });
      }

      if (req.method === 'GET' && req.url === '/latest') {
        try {
          const raw = await fs.readFile(path.join(dir, 'latest.json'), 'utf8');
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(raw);
        } catch {
          return sendJson(404, { ok: false, error: 'No backup stored yet' });
        }
      }

      if (req.method === 'GET' && req.url === '/snapshots') {
        return sendJson(200, { ok: true, snapshots: await listSnapshots(dir) });
      }

      if (req.method === 'POST' && req.url === '/backup') {
        if (req.headers['x-backup-token'] !== backupToken()) {
          return sendJson(401, { ok: false, error: 'Bad or missing x-backup-token' });
        }
        let raw = '';
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy();
            return;
          }
          raw += chunk;
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return sendJson(400, { ok: false, error: 'Body is not valid JSON' });
        }
        if (!looksLikeBackupPayload(parsed)) {
          return sendJson(400, { ok: false, error: 'Body does not look like a Wakulima backup payload' });
        }
        await fs.mkdir(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await fs.writeFile(path.join(dir, `snapshot-${stamp}.json`), raw);
        await fs.writeFile(path.join(dir, 'latest.json'), raw);
        await pruneSnapshots(dir, Number(process.env.MAX_SNAPSHOTS ?? 30));
        const count = (await listSnapshots(dir)).length;
        return sendJson(200, { ok: true, received_at: stamp, snapshots_on_disk: count });
      }

      return sendJson(404, { ok: false, error: `No route: ${req.method} ${req.url}` });
    } catch (err) {
      return sendJson(500, { ok: false, error: String((err && err.message) || err) });
    }
  });

  return new Promise(resolve => {
    server.listen(port, '0.0.0.0', () => {
      const actual = server.address().port;
      if (typeof process.env.WAKULIMA_SERVER_QUIET === 'undefined') {
        console.log(`Wakulima LAN backup receiver: http://0.0.0.0:${actual} (dir: ${dir})`);
      }
      resolve({ server, port: actual, dir });
    });
  });
}

// CLI entry: `node server/backup-server.mjs` (tests import startBackupServer instead).
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  startBackupServer();
}
