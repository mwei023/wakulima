-- Wakulima sync schema (ADR-002 §7 as amended by the 2.2b implementation
-- notes). Applied once per fresh Postgres (docker-entrypoint-initdb.d when
-- using compose).
--
-- Money is ALWAYS bigint integer cents (KES × 100) — never numeric floats.
-- Every synced table carries the ADR-002 envelope:
--   id, device_id, device_seq (unique per device — the idempotency key),
--   created_at, updated_at, deleted_at (tombstone; rows are never purged).
--
-- Two-tier storage:
--   * typed tables hold FINAL STATE (one row per record id) for FK integrity
--     and accountant-friendly queries;
--   * sync_log is the append-only INGEST LOG (one row per accepted version,
--     global mono seq) that the pull cursor reads — LWW updates and
--     tombstones always produce a NEW log entry, so every till converges.
--
-- stock_quantity does NOT exist here; derived stock lives in the till
-- (ADR-002 §3.1). Credit balances are likewise never stored.

create extension if not exists pgcrypto;

create table devices (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  token_hash    text not null unique,
  first_seen    timestamptz not null default now(),
  last_push_at  timestamptz,
  last_pull_at  timestamptz,
  pushed_seq    bigint not null default 0 check (pushed_seq >= 0),
  revoked_at    timestamptz
);

-- The pull spine: one row per accepted record version. Consumers track a
-- single global watermark. record is the full client row (money stays JSON
-- numbers; bigint cents are < 2^53).
create table sync_log (
  seq        bigint generated always as identity primary key,
  device_id  uuid not null,
  table_name text not null,
  record     jsonb not null,
  logged_at  timestamptz not null default now()
);
create index sync_log_seq_idx on sync_log (seq);

-- ============ P/S class: profiles with tombstones ============

create table products (
  id            uuid primary key,
  device_id     uuid not null references devices(id),
  device_seq    bigint not null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  deleted_at    timestamptz,
  opening_stock integer not null default 0,
  name          text not null,
  category      text not null,
  unit          text not null,
  selling_price bigint not null check (selling_price >= 0),
  cost_price    bigint not null check (cost_price >= 0),
  reorder_level integer not null default 0,
  barcode       text,
  unique (device_id, device_seq)
);
create index products_barcode_idx on products (barcode);

create table customers (
  id         uuid primary key,
  device_id  uuid not null references devices(id),
  device_seq bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  name       text not null,
  phone      text not null default '',
  credit_limit bigint not null default 0 check (credit_limit >= 0),
  store_id   text not null default 'main-store',
  unique (device_id, device_seq)
);

-- ============ E class: additive events ============

create table sales (
  id              uuid primary key,
  device_id       uuid not null references devices(id),
  device_seq      bigint not null,
  created_at      timestamptz not null,
  updated_at      timestamptz not null,
  deleted_at      timestamptz,
  customer_id     uuid,                       -- null = walk-in; no FK by design
  total_amount    bigint not null check (total_amount >= 0),
  payment_method  text not null check (payment_method in ('cash','mpesa','credit')),
  mpesa_reference text,
  receipt_number  bigint not null,
  status          text not null default 'completed' check (status in ('completed','voided')),
  timestamp       timestamptz not null,
  store_id        text not null default 'main-store',
  unique (device_id, device_seq)
);
create index sales_customer_idx on sales (customer_id);
create index sales_timestamp_idx on sales (timestamp);

create table sale_items (
  id           uuid primary key,
  sale_id      uuid not null references sales(id),
  -- device_id is ATTRIBUTION ONLY (server-stamped, no device_seq): it exists
  -- so a device's own writes can be filtered out of pulls; the row's identity
  -- rides the sale's device_seq in the log.
  device_id    uuid not null references devices(id),
  product_id   uuid not null,                 -- no FK: products may tombstone
  product_name text not null,
  quantity     integer not null check (quantity > 0),
  unit_price   bigint not null check (unit_price >= 0),
  total_line   bigint not null check (total_line >= 0),
  item_seq     integer not null default 1
);
create index sale_items_sale_idx on sale_items (sale_id);

create table returns (
  id            uuid primary key,
  device_id     uuid not null references devices(id),
  device_seq    bigint not null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  deleted_at    timestamptz,
  sale_id       uuid not null references sales(id),
  product_id    uuid not null,
  quantity      integer not null check (quantity > 0),
  reason        text not null default '',
  return_type   text not null default 'refund',
  refund_amount bigint not null check (refund_amount >= 0),
  status        text not null default 'pending',
  notes         text not null default '',
  completed_at  timestamptz,
  unique (device_id, device_seq)
);
create index returns_sale_idx on returns (sale_id);

-- Customer repays part of the credit tab (the capability §3.3 adds).
-- method 'opening' = a v7 legacy-balance conversion event (ADR-002 §9.2):
-- debt that predates any recorded sale, applied as balance -= amount.
create table payments (
  id         uuid primary key,
  device_id  uuid not null references devices(id),
  device_seq bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  customer_id uuid not null,
  amount     bigint not null check (amount <> 0),  -- applied as: balance -= amount; NEGATIVE =
                                                    -- 'opening'-class debt without a backing sale
                                                    -- (v7 legacy conversion, ADR-002 §9.2)
  method     text not null default 'cash' check (method in ('cash','mpesa','opening')),
  note       text not null default '',
  unique (device_id, device_seq)
);
create index payments_customer_idx on payments (customer_id);

-- Stocktakes write deltas, never absolute counts (§3.1).
create table adjustments (
  id         uuid primary key,
  device_id  uuid not null references devices(id),
  device_seq bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  product_id uuid not null,
  delta      integer not null,                 -- signed; can be negative
  reason     text not null default 'stocktake' check (reason in ('stocktake','damage','loss','found','other')),
  note       text not null default '',
  unique (device_id, device_seq)
);
create index adjustments_product_idx  on adjustments (product_id);

-- Audit trail: additive, append-only. Cryptographic chaining lands with 2.x auth.
create table audit_events (
  id         uuid primary key,
  device_id  uuid not null references devices(id),
  device_seq bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  user_id    text,
  action     text not null,
  table_name text not null,
  record_id  text,
  old_values jsonb,
  new_values jsonb,
  unique (device_id, device_seq)
);
create index audit_action_idx on audit_events (action);
