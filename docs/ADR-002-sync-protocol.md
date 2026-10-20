# ADR-002: Sync protocol — cursors, additive deltas, staged Postgres (Phase 2.2a)

**Status:** Approved (owner, §9) · implemented in 2.2b stage 1
**Date:** 2026-10-18
**Depends on:** ADR-001 (Option A fleet, staged backup topology)

## Implementation notes (2.2b server build, 2026-10-18)

- **§4 pull cursor:** implemented as a **global append-only ingest log**
  (`sync_log`: one row per accepted record version, global mono `seq`) —
  exactly the design originally drafted here. A per-table-final-state cursor
  was tried first and **rejected with proof**: an LWW overwrite updates the
  typed row in place, so a till whose watermark already passed that row would
  never re-see it and could silently diverge. New version ⇒ new log seq ⇒
  every till converges. Typed tables hold final state (FK integrity,
  accountant queries); `sale_items` gained an attribution-only `device_id` so
  a till's own writes filter out of pulls.
- **Idempotency/LWW upsert:** typed rows upsert on the record uuid
  (`on conflict (id) do update … where device matches and new seq > stored`);
  replays and stale seqs are no-ops. The `(device_id, device_seq)` unique
  constraint remains the transport idempotency key.
- **Cross-device uuid collisions** (protocol breach) are silent no-ops at the
  server — detectable via audit, never overwriting another till's row.
- **bigint note:** pg returns bigint as JS strings; the server coerces
  watermarks to numbers (`acked + 1` on a string would concat) and hands
  money/seqs to clients as JSON numbers (< 2^53 by construction).
- **Server surface:** `POST /devices` (token mint, shown once, stored hashed),
  `POST /sync/push` (continuity-checked, transactional; seq gap → 409),
  `GET /sync/pull?since=N` (paged, drained flag), `GET /healthz`.
  `docker-compose.yml` = postgres + sync API + 2.1 backup receiver on one
  shop PC; tokens live in the local `.env` (see `.env.example`).
- **Integration tests** (`server/sync/sync.test.mjs`) run against a REAL
  Postgres — ephemeral docker locally, a CI service on GitHub Actions; skip
  loudly (never fake-pass) when neither exists. Two server bugs were caught
  only by these tests and fixed at the root (string bigint watermark; missing
  sale_items attribution).

## 0. What is and is NOT being built

- **Already built (2.1):** snapshot *backup* receiver — the off-device copy
  (`latest.json`). That stays as-is; it is insurance, not sync.
- **This ADR designs:** change-level *sync* so 2+ tills converge on one truth.
- **Explicitly out of scope:** real-time anything; WebSockets; CRDTs. The till
  never waits on the network to sell (invariant kept from ADR-001).

## 1. The golden invariant

**The local Dexie DB is always the sole source of truth for its own till.**
Sync can be degraded, late, absent, or failing — selling, credit, and voiding
never block or error because of it. The server is a dumb, boring convergence
point, never a gate.

## 2. Record envelope (every synced row carries)

```
id          uuid   (assigned by the creating device, never reused)
device_id   uuid   (which till wrote this)
device_seq  int    (strictly monotonic per device; gaps = protocol breach)
created_at  iso
updated_at  iso    (ticked on every local mutation of the row)
deleted_at  iso|n  (tombstone — rows are NEVER hard-deleted from sync)
```

One extra integer lives in `localMeta`: `sync_seq` watermark — "my last
acknowledged device_seq per direction."

## 3. The three record classes (this is the heart of the design)

| Class | Examples | Merge rule |
|---|---|---|
| **E — additive events** | sales, sale_items, returns, credit **payments**, stock adjustments, audit entries | Apply once by record id; mathematically commutative — **never conflict by construction.** |
| **P — profile fields** | product name/price/category, customer name/phone/limit | **Last-writer-wins** on `(updated_at, device_id)`; every overridden field is logged to audit. |
| **S — state with tombstones** | deleted product, deleted customer | Tombstone wins if it is the newest event for that id; edits arriving after a tombstone stay suppressed but logged. Reactivation is an explicit new-create event. |

### 3.1 Why stock must be derived, not stored

Two tills that both sold "the last unit" before seeing each other's sales
would each push a corrected *count*, and one correction would vanish —
that's stock-from-nothing at fleet scale. Therefore:

- `stock_quantity` on a synced device is a **materialized view**, recomputed
  locally after every applied event: `opening + Σ sales(-qty) + Σ returns(+qty)
  + Σ adjustments(+/-)`.
- A physical stocktake never writes a corrected absolute count over the air —
  it writes an **adjustment event** `delta = counted - current_view`. Deltas
  from different tills merge exactly; nothing vanishes.

### 3.2 Accepted consequence: overselling between sync runs

Two tills offline can sell below zero jointly. We **accept** this (the fleet
alternative — blocking the till on the network — violates §1):

1. Pull-before-push on every sync cycle minimizes the window (see §4).
2. Any till whose computed stock < 0 shows a **"sold through — reconcile"**
   state, logged to audit; reconciliation is a physical count → adjustment
   event. No silent negative.
3. Credit sales already require the customer row; balances follow §3.3.

### 3.3 Credit balances become derived too (schema change, v7)

`outstanding_balance` is currently a stored field — two tills adjusting the
same customer would LWW-trample money. Rule: **balance = Σ sales(credit, −tot)
+ Σ returns(refund/credit, −refund) + Σ payments(−amount)**, recomputed on
each applied event. This requires a new local table (credit payments, which
the local DB does not model yet) — a v7 Dexie migration lands with 2.2c. The
stored field becomes a derived cache that the UI may read but not write.

## 4. The push/pull loop

Triggers: app open, every 30s while the page is visible, network `online`
event, and (debounced 5s) after each local mutation.

```
push:  POST /sync/push  { device_id, records[device_seq > my_last_acked] }
       server: validate token, validate seq continuity, upsert by (type, id)
       → { acked_through: <max device_seq accepted> }   (replay-safe)
pull:  GET  /sync/pull?since=<my_watermark>&limit=1000  (loop until drained)
       server: rows with global ingest seq > since
       apply:  E → idempotent upsert, then recompute stock/balance
               P → LWW(§3), log if it overrides
               S → tombstone rules(§3)
       → advance local watermark
```

Idempotency: push replays and pull replays are both no-ops (upsert by id; pull
watermark only advances after apply). Crash mid-pull re-pulls.

## 5. Server shape (built in 2.2b — nothing clever)

- **Own Postgres**, one schema mirroring the shop tables + envelope columns.
- **One sync API**: Node, sibling of the 2.1 backup receiver, `/healthz`,
  `/sync/push`, `/sync/pull`, token-per-device auth (admin mints device
  bootstrap tokens; tokens stored hashed).
- One `docker-compose.yml`: postgres + api. Deliberately no new words.
- Ingest seq: `bigint GENERATED ALWAYS AS IDENTITY` per table — the pull
  cursor.

### 5.1 Staged topology (this ADR's layout decision)

| Stage | Where Postgres lives | Tills sync to | Internet needed |
|---|---|---|---|
| **Stage 1 (first)** | The 2.1 backup PC in the shop | LAN URI | **No** |
| **Stage 2 (later)** | Shop's own VPS | Optionally direct, or via replication | Yes (for VPS only) |

Protocol and API binary are identical at both stages — moving to VPS means
re-pointing a URI or turning on logical replication for off-site safety. The
same box can start as backup receiver + sync host in stage 1 (one process,
`node server/`).

## 6. Conflict matrix summary (the whole list — deliberately short)

| Situation | Outcome |
|---|---|
| Two tills edit same product price offline | LWW; loser's edit logged to audit |
| Two tills edit different products | Independent; no conflict |
| Two tills sell to credit limit simultaneously | Both succeed locally; combined balance may exceed limit until events merge; audit flags; cashier sees unsettled-credit state — **accepted, same logic as oversell** |
| Edit arrives after tombstone | Stays deleted; edit logged |
| Same device_seq pushed twice | Second is a no-op (idempotency) |
| device_seq gap detected | Device rejects its own outbox, re-bases (logged; never silently renumbers) |

## 7. Schema draft (review target for 2.2b; SQL now, files later)

```sql
create table devices (
  id uuid primary key,
  name text not null,
  token_hash text not null,
  first_seen timestamptz not null default now(),
  last_push_at timestamptz,
  last_pull_at timestamptz,
  pushed_seq bigint not null default 0        -- server-side continuity check
);

-- Representative typed tables (all carry the envelope):
create table products (
  id uuid primary key,
  device_id uuid not null references devices(id),
  device_seq bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  opening_stock integer not null default 0,
  name text not null,
  category text not null,
  unit text not null,
  selling_price bigint not null,   -- integer cents
  cost_price bigint not null,
  reorder_level integer not null,
  barcode text,
  seq bigint generated always as identity,
  unique (device_id, device_seq)
);
-- customers / sales / sale_items / returns / payments / adjustments /
-- audit_events follow the same envelope; funds are bigint cents everywhere.
-- stock_quantity is NOT a synced column; it does not exist on the server.
```

## 8. Rollout plan (2.2b/2.2c) — each its own gate

1. **Server + compose + migrate** — CI green, schema applied on the LAN box.
2. **Client envelope migration (Dexie v7)** — envelope columns + payments
   table + derived stock/balance recompute, property-tested like 1.4 was.
3. **Two-till fixture drill (automated):** device A and B sell concurrently
   offline → merge → audit exactly shows both sales, derived stock = −1 →
   flagged sold-through; LWW conflict path asserted; oversell logged.
4. **Real second device** on the shop LAN for a week alongside the paper
   process (Phase 4 shadow mode moved earlier, deliberately).

**Abort criteria:** if two-till reconciliation turns out to confuse cashiers in
shadow mode, we fall back to documented single-till (Option B) with the backup
spine we already shipped — no sunk-cost sync sprawl.

## 9. What the owner is asked to approve

1. Overselling *between sync runs* is possible by design and flagged, not hidden (§3.2).
2. Credit balance edits by hand are replaced by payments/adjustments events (§3.3).
3. Profile edits LWW rather than conflict dialogs a cashier must resolve (§3).
4. Stage 1: sync server on the in-shop PC's LAN, VPS later (§5.1).
