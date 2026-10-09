# ADR-001: Architecture fork — sync spine, backup topology, auth, purged history

**Status:** Accepted · 2026-10-09
**Deciders:** shop owner (via guided questions) + development
**Supersedes:** the open Option A/B fork in ROADMAP.md Phase 2

## Context

Phase 1.4 closed with all local layers green (49 unit + property tests, 6 e2e
drills, db.ts coverage 90.6%, CI green). The one decision the roadmap refused
to let us drift on — "one device forever, or a fleet someday?" — was put to the
shop owner with real options. Four answers came back and they set the course
for Phases 2–4.

## Decisions

### 1. The fork: Option A — "Fleet of islands" (local-first with a sync spine)

**Answer: "2+ devices someday."** Wakulima Agrovet may run more than one till,
and the owner wants central visibility. Therefore:

- Dexie/IndexedDB stays the **source of truth on every device** — the POS never
  blocks on the network, online or offline.
- The shop's **own Postgres server** is the sync target (decided 2026-09-29,
  reaffirmed here). No Supabase, no third-party BaaS. One schema, one sync
  API, credentials in one `.env` on the server.
- Sync design per ROADMAP Phase 2 Option A: every local record gains
  `device_id`, `device_seq`, `updated_at`, `deleted_at` (tombstones, never
  hard-delete); push/pull loop on `online` event + interval; stock counts merge
  as **additive deltas** (sales/returns are deltas and merge naturally),
  profile fields last-writer-wins; every conflict logged to audit.
- Effort: 4–6 weeks, dominated by the conflict matrix and flaky-network tests.

### 2. Backup topology: staged — LAN receiver now, VPS later

**Answer: "Both (staged)."** Outcome if a device is lost or broken must be "swap
the till", not "hope you exported":

- **Stage 1 (Phase 2.1, starting now):** a small receiver service on an
  always-on computer in the shop, same router as the till. Till pushes the
  JSON snapshot (same `BackupPayload` v2 schema) over plain HTTP to the LAN
  receiver; works with zero internet. Router must DHCP-reserve the receiver's
  IP and have AP/client isolation OFF.
- **Stage 2 (later Phase 2):** nightly push from the LAN receiver to the shop's
  own VPS (in-country or the shop's VPS) so a shop-level catastrophe
  (theft/fire/both-machines-die) doesn't take the only off-device copy with it.
- Rule preserved in both stages: the LAN/VPS copy is a **mirror**, never a
  dependency — selling continues fully offline, pushes queue and replay.

### 3. Auth: grows up immediately after the backup spine

**Answer: "Yes, next after backup."** Today auth is UI paint only — anyone
opening the app is admin. Sequence (per ROADMAP 2.x):

1. PIN-per-cashier for till switching (cashiers don't type passwords).
2. Owner/admin login against our own Postgres.
3. Role enforcement moves from `useRole` UI checks **into the data layer**:
   db.ts functions take a session and refuse unauthorized writes.
4. Audit entries cryptographically chained (hash of prev entry) so tampering
   is detectable.

### 4. Git history: .env purged (completed 2026-10-09)

**Answer: "Yes, do it now."** Done on the record:

- `git filter-repo --invert-paths --path .env` on a fresh clone (116 commits
  rewritten, 0 `.env` blobs remain — verified via `rev-list --objects --all`).
- Force-pushed `main` (`bedc8e2...92a99b7` forced update). CI green on the
  rewritten head (`92a99b7`, run 37927062835).
- All 14 stale `auto-fix/*` remote branches + 2 stale local branches deleted —
  they anchored pre-purge history (and the leaked key) forever.
- Local repo re-cloned state: reflog expired, `gc --prune=now --aggressive`,
  `fetch.prune=true` set. Old clone (bedc8e2-era) copies on any other machine
  must be re-cloned; they are dead forks of a history that no longer exists.
- Note: the old Supabase anon key was already dead (project deleted,
  2026-09-29). This purge was hygiene plus bot-branch cleanup, not rotation.

## Consequences

- Phase 2 work order: **2.1 LAN backup receiver → 2.2 sync protocol design →
  2.x auth → 3 bundle purge** (bundle purge can overlap; it is
  backup-independent).
- The dead `queuedSales`/`conflicts` tables stay deleted; the new sync spine is
  built fresh with tombstones and cursors, not resurrected from their schema.
- The 20h rolling-backup + 7-day export reminder stay as-is until the LAN
  receiver replaces the reminder's role of "only protection".
- Multi-device onboarding (Phase 3.3 "this browser is now the till") becomes a
  fleet-join flow (choose: new till vs. secondary viewer), not a single-device
  guard.

**Exit gate for Phase 2 (per ROADMAP):** one sync-protocol ADR diagram + LAN
receiver running a real nightly push with a rehearsed restore drill + auth no
longer bypassable.
