import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

/**
 * Wakulima sync API (ADR-002, Phase 2.2b). The dumb, boring convergence
 * point for a fleet of tills (§1 golden invariant: the till never waits
 * on this server). Sibling of the 2.1 backup receiver; run by the same box
 * in stage 1 (in-shop LAN, works with zero internet).
 *
 * Endpoints (all JSON):
 *   GET  /healthz                      { ok }
 *   POST /devices   x-admin-token      { id, token }   — mint ONE device token (shown once, stored hashed)
 *   POST /sync/push    x-device-token  { records: { table: rows[] } }
 *                                      → { ok, acked_through }   (idempotent replay; seq-gap → 409)
 *   GET  /sync/pull?since=<perTableJson>  → per-table rows the device has not seen
 *
 * Money: bigint integer cents everywhere (Postgres bigint = JS string via pg —
 * serialized to the client as numbers after a Number.isSafeInteger guard).
 */

const TABLES = ['products', 'customers', 'sales', 'sale_items', 'returns', 'payments', 'adjustments', 'audit_events'];

// Columns per table (order matters only for the generic INSERT builder).
const COLUMNS = {
  products:      ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'opening_stock', 'name', 'category', 'unit', 'selling_price', 'cost_price', 'reorder_level', 'barcode'],
  customers:     ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'name', 'phone', 'credit_limit', 'store_id'],
  sales:         ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'customer_id', 'total_amount', 'payment_method', 'mpesa_reference', 'receipt_number', 'status', 'timestamp', 'store_id'],
  // sale_items: device_id is server-stamped ATTRIBUTION ONLY (no device_seq —
  // their identity rides the sale's); it powers the own-writes pull filter.
  sale_items:    ['id', 'sale_id', 'device_id', 'product_id', 'product_name', 'quantity', 'unit_price', 'total_line', 'item_seq'],
  returns:       ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'sale_id', 'product_id', 'quantity', 'reason', 'return_type', 'refund_amount', 'status', 'notes', 'completed_at'],
  payments:      ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'customer_id', 'amount', 'method', 'note'],
  adjustments:   ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'product_id', 'delta', 'reason', 'note'],
  audit_events:  ['id', 'device_id', 'device_seq', 'created_at', 'updated_at', 'deleted_at', 'user_id', 'action', 'table_name', 'record_id', 'old_values', 'new_values'],
};

const uuidOk = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');

// Envelope column checks; types per table's money/count columns are enforced
// by Postgres CHECKs — the API's job is routing, authn, continuity, idempotency.
function rowLooksSane(table, row, deviceId) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return false;
  if (!uuidOk(row.id)) return false;
  // sale_items inheriting their sale's identity carry only a uuid pk; every
  // other table must carry its own device_seq (the (device_id, device_seq)
  // idempotency key).
  if (COLUMNS[table].includes('device_seq')) {
    const seq = Number(row.device_seq);
    if (!Number.isSafeInteger(seq) || seq <= 0) return false;
  }
  if (COLUMNS[table].includes('device_id') && row.device_id && row.device_id !== deviceId) return false;
  // device_id may be omitted entirely — the server owns that column and
  // normalizeRow stamps the authenticated device on every row.
  return COLUMNS[table].every(col => col in row || col === 'device_id');
}

// Envelope columns that MUST carry stale-nothing semantics on record types without device_id.
function normalizeRow(table, row, deviceId) {
  const out = {};
  for (const col of COLUMNS[table]) {
    let v = row[col];
    if (col === 'deleted_at' && (v === null || v === undefined || v === '')) v = null;
    if (v === undefined) v = col === 'deleted_at' ? null : null;
    out[col] = v;
  }
  if (COLUMNS[table].includes('device_id')) out.device_id = deviceId;
  return out;
}

function getPoolConfig() {
  const url = process.env.DATABASE_URL;
  if (url) return { connectionString: url };
  return {
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'wakulima',
    password: process.env.PGPASSWORD ?? 'wakulima',
    database: process.env.PGDATABASE ?? 'wakulima',
  };
}

export function createPool(config = getPoolConfig()) {
  const pool = new pg.Pool(config);
  return pool;
}

const PULL_PAGE = Number(process.env.SYNC_PULL_PAGE ?? 500);

export function makeSyncServer(pool) {
  const q = (text, params) => pool.query(text, params);

  function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  async function deviceFromToken(token) {
    const { rows } = await q('select id, name, revoked_at, pushed_seq from devices where token_hash = $1', [sha256(token)]);
    const dev = rows[0];
    if (!dev || dev.revoked_at) throw httpError(401, 'Unknown device token');
    // pg hands bigint back as a string — a string pushed_seq would make
    // `acked + 1` string-concatenate; the counter must be a number.
    dev.pushed_seq = Number(dev.pushed_seq);
    return dev;
  }

  async function handleReq(req, res, url) {
    const sendJson = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') {
        await q('select 1');
        return sendJson(200, { ok: true, service: 'wakulima-sync' });
      }

      if (req.method === 'POST' && url.pathname === '/devices') {
        const admin = process.env.ADMIN_TOKEN;
        if (!admin || req.headers['x-admin-token'] !== admin) {
          return sendJson(403, { ok: false, error: 'Forbidden' });
        }
        const raw = await readBody(req, 8192);
        const body = JSON.parse(raw);
        const name = String(body?.name ?? '').trim();
        if (!name) return sendJson(400, { ok: false, error: 'Device name required' });
        const token = `wk_${crypto.randomBytes(24).toString('base64url')}`;
        const { rows } = await q(
          'insert into devices (name, token_hash) values ($1, $2) returning id, name, first_seen',
          [name, sha256(token)]
        );
        return sendJson(201, { ok: true, device: rows[0], token }); // token shown ONCE
      }

      if (req.method === 'POST' && url.pathname === '/sync/push') {
        const dev = await deviceFromToken(req.headers['x-device-token']);
        const body = JSON.parse(await readBody(req, 64 * 1024 * 1024));
        const records = body?.records ?? {};
        // Validate + flatten BEFORE any transaction so 4xx never touches the db.
        for (const table of Object.keys(records)) {
          if (!COLUMNS[table]) return sendJson(400, { ok: false, error: `Unknown table ${table}` });
          if (!Array.isArray(records[table])) return sendJson(400, { ok: false, error: `${table} must be an array` });
        }
        // One per-device monotonic counter spans ALL typed tables (§2, §6):
        // rows must interleave by device_seq across tables, then sale_items
        // (identity = their sale's) last so FK targets exist.
        const envelopeRows = [];
        const plainRows = [];
        for (const table of Object.keys(records)) {
          for (const raw of records[table]) {
            if (!rowLooksSane(table, raw, dev.id)) {
              return sendJson(400, { ok: false, error: `Malformed ${table} row` });
            }
            if (COLUMNS[table].includes('device_seq')) {
              envelopeRows.push({ table, raw, seq: Number(raw.device_seq) });
            } else {
              plainRows.push({ table, raw });
            }
          }
        }
        envelopeRows.sort((a, b) => a.seq - b.seq);

        let acked = dev.pushed_seq;
        await pool.connect().then(async client => {
          try {
            await client.query('begin');
            for (const { table, raw, seq } of envelopeRows) {
              if (seq <= acked) continue; // idempotent replay of an acked row
              if (seq !== acked + 1) {
                throw httpError(409, `Device sequence gap: got ${seq}, expected ${acked + 1}`);
              }
              const cols = COLUMNS[table];
              const values = normalizeRow(table, raw, dev.id);
              const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
              // Upsert on the row uuid: the final typed state follows LWW
              // (ADR-002 §3) — same-device continuity by seq (an older replay
              // can never regress the row), and a DIFFERENT device that edited
              // the same shared id (pulled-then-edited row) lands when its
              // updated_at is newer, ties broken by device uuid. The sync_log
              // append below records BOTH versions either way, so every till
              // converges and a cross-device uuid collision stays auditable.
              const sets = cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');
              await client.query(
                `insert into ${table} (${cols.join(',')}) values (${placeholders})
                 on conflict (id) do update set ${sets}
                 where (${table}.device_id = excluded.device_id and excluded.device_seq > ${table}.device_seq)
                    or excluded.updated_at > ${table}.updated_at
                    or (excluded.updated_at = ${table}.updated_at and excluded.device_id > ${table}.device_id)`,
                cols.map(c => values[c])
              );
              // Append the version to the ingest log — the pull spine. New
              // log seq every accepted version (incl. LWW overwrites and
              // tombstones), so every till converges (§4).
              await client.query(
                `insert into sync_log (device_id, table_name, record) values ($1, $2, $3::jsonb)`,
                [dev.id, table, values]
              );
              acked = seq;
            }
            for (const { table, raw } of plainRows) {
              const cols = COLUMNS[table];
              const values = normalizeRow(table, raw, dev.id);
              const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
              await client.query(
                `insert into ${table} (${cols.join(',')}) values (${placeholders}) on conflict (id) do nothing`,
                cols.map(c => values[c])
              );
              await client.query(
                `insert into sync_log (device_id, table_name, record) values ($1, $2, $3::jsonb)`,
                [dev.id, table, values]
              );
            }
            if (acked > dev.pushed_seq) {
              await client.query('update devices set pushed_seq = $1, last_push_at = now() where id = $2', [acked, dev.id]);
            }
            await client.query('commit');
          } catch (e) {
            await client.query('rollback');
            throw e;
          } finally {
            client.release();
          }
        });
        return sendJson(200, { ok: true, acked_through: acked });
      }

      if (req.method === 'GET' && url.pathname === '/sync/pull') {
        const dev = await deviceFromToken(req.headers['x-device-token']);
        // One GLOBAL watermark over the append-only ingest log (§4): an LWW
        // overwrite or tombstone is a NEW log entry, so no till can miss it.
        const lastSeq = Number.isFinite(Number(url.searchParams.get('since')))
          ? Math.max(0, Number(url.searchParams.get('since')))
          : 0;
        const { rows } = await q(
          `select seq, table_name, record from sync_log
           where seq > $1 and (record->>'device_id') is distinct from $2
           order by seq limit ${PULL_PAGE}`,
          [lastSeq, dev.id]
        );
        await q('update devices set last_pull_at = now() where id = $1', [dev.id]);
        return sendJson(200, {
          ok: true,
          events: rows.map(r => ({ seq: Number(r.seq), table: r.table_name, record: r.record })),
          since_next: rows.length ? Number(rows[rows.length - 1].seq) : lastSeq,
          drained: rows.length < PULL_PAGE,
        });
      }

      return sendJson(404, { ok: false, error: `No route: ${req.method} ${url.pathname}` });
    } catch (err) {
      const status = err?.status ?? 500;
      if (status >= 500) console.error('sync error:', err);
      return { status: err?.status ?? 500, body: { ok: false, error: err?.message ?? String(err) } };
    }
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > limit) { req.destroy(); reject(httpError(413, 'Body too large')); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleReq(req, res, url).then(result => {
      if (result) {
        res.writeHead(result.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result.body));
      }
      if (!res.writableEnded) { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"ok":false}'); }
    }).catch(err => {
      if (!res.writableEnded) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
      }
    });
  });

  return server;
}

export async function startSyncServer({ pool, port = 0 } = {}) {
  const realPool = pool ?? createPool();
  const server = makeSyncServer(realPool);
  await new Promise(resolve => {
    server.listen(port, '0.0.0.0', () => resolve());
  });
  return { server, pool: realPool, port: server.address().port };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const port = Number(process.env.PORT ?? 8788);
  const { server } = await startSyncServer({ port });
  console.log(`Wakulima sync API: http://0.0.0.0:${server.address().port}`);
}
