# Wakulima Smart Stock — Production Roadmap

Status as of 2026-09-29. Current state: solid prototype. All checks green
(build ✅, tsc ✅, 31/31 unit tests ✅). **Phase 0 is complete** except the
manual git-history key purge (0.1). This roadmap closes that gap and then some.

Rule of thumb for every phase below: **nothing merges unless build + tsc +
vitest + lint are green in CI.** Phase 0 builds that gate; everything else
depends on it.

---

## Phase 0 — Stop the bleeding (1 week, no new features)

Goal: make the repo trustworthy and the data survivable. No product changes.

### 0.1 Security cleanup (do first, half a day)
- [x] **Supabase fully removed** (2026-09-29): `.env` deleted from the tree,
      hand-rolled `public/sw.js` with its `supabase.co` fetch branch deleted,
      backend direction changed to the shop's own Postgres. The old anon key
      was only ever usable against the deleted Supabase project — nothing
      left to rotate; the git-history purge below is now hygiene, not security.
- [ ] Purge `.env` from history: `git filter-repo --invert-paths --path .env`
      (force-push is required — coordinate before doing it).
- [x] Delete stale artifacts from the tree: `dev-dist/`, `FETCH_HEAD`, dead
      `bun.lockb` and stale `TODO.md` untracked/removed; `dist/`,
      `test-results/` now gitignored.
- [x] Pick one lockfile: `package-lock.json` kept, `bun.lockb` deleted.

### 0.2 Data durability (the F grade, 2–3 days)
This is the single most important phase of the entire roadmap.

- [x] Call `navigator.storage.persist()` at startup (`src/lib/storage.ts`,
      wired via `src/lib/bootstrap.ts`).
- [x] Show storage status in Settings: "persisted ✓ / eviction possible ✗",
      estimated usage via `navigator.storage.estimate()`.
- [x] **Automatic rolling backup**: on app open (and daily, and on tab
      re-focus), serialize products/customers/sales/returns/audit to a JSON
      snapshot in a separate Dexie DB (`src/lib/backup.ts`). Keep last N=7.
- [x] **Backup reminder**: if the last *downloaded* (off-device) backup is > 7
      days old (or never), show a banner in Layout until the user exports.
- [x] Restore-from-file flow in BackupManager, zod-validated
      (`src/lib/backupSchema.ts`) and transactional, with confirm dialog.

### 0.3 CI (half a day)
- [x] GitHub Actions: `npm ci → tsc --noEmit → vitest run → eslint → vite build`
      on every PR and push to main (`.github/workflows/ci.yml`).
- [x] Playwright e2e (`e2e/pos.spec.ts`) on PRs, chromium only to start.

### 0.4 Lint debt (half a day, on the clock)
- [x] Fix the 18 errors (mostly `no-explicit-any` + a `require()` in
      tailwind.config.ts). 0 errors remain; 11 warnings (react-hooks and
      react-refresh advisories) triaged and left for the Phase 3 cleanup.
      Lint errors now fail CI, so this never regrows.

**Exit gate for Phase 0:** CI green required to merge; persistent storage
granted; rolling + downloadable backups in place; secrets out of history.

---

## Phase 1 — Earn the "POS" in the name (2–3 weeks)

Goal: correctness and integrity of the money paths. Features wait.

### 1.1 Fix the sale lifecycle ✅ (done — see note)
- [x] Sales are created with `status: 'completed'`; reports, Settings and the
      backup stats exclude `voided` sales from money totals via the
      `activeSales` helper (legacy `'pending'`/`'synced'` values are tolerated
      and still count — no Dexie version bump needed).
- [x] Void/cancel sale flow with restock (inverse of a sale, transactional,
      audit-logged): `voidLocalSale` in db.ts (restock + credit reversal +
      `void_sale` audit entry in one transaction), store `voidSale` action,
      returns against voided sales are blocked, 5 unit tests.

### 1.2 Concurrency and multi-device reality ✅ (done)
Even "local-only" apps run in two browser tabs.
- [x] `startLiveSync` (src/lib/liveSync.ts) subscribes Dexie `liveQuery` for
      products/customers/sales into the store, wired in useDataLoader. Dexie 4
      propagates cross-tab, so every open tab updates instead of showing stale
      stock (proven by e2e/multiTab.spec.ts). Concurrent first-run seeding made
      safe (bulkPut).
- [x] Test: two overlapping sales for the same last unit — one fails cleanly
      inside the transaction (db.test.ts), exactly one sale recorded, stock 0.

### 1.3 Money hygiene ✅ (done)
- [x] Integer cents (KES × 100) everywhere money is stored or computed:
      types documented, mock data converted, Dexie v6 upgrade migrates
      existing KES-float databases in-place, backup schema v2 with live
      v1 → v2 conversion on restore, `kesToCents`/`centsToKes`/`formatCurrency`
      as the only UI-boundary converters (`src/lib/money.test.ts` pins the
      0.1 + 0.2 case), exact refund math (cents × qty, no rounding).
- [x] Explicit M-Pesa handling: required reference field (phone/confirmation
      code, ≤32 chars, trimmed), validated in POS + db.ts, stored on the sale,
      printed on the receipt.
- [x] Sequential receipt numbers (1-based, per-shop counter in `localMeta`,
      handed out inside the sale transaction), printed as `#0001`-style with
      UUID fallback for legacy rows. Note: VAT/PIN left at the existing 0%
      placeholder — feed and vet medicines are VAT-exempt; revisit if the
      shop sells VATable lines.

### 1.4 Test coverage to match the money ✅ (done 2026-10-08)
- [x] Unit: credit-limit boundary (exactly at limit), return-of-return idempotency
      (rejected returns are terminal), restock-once invariants (void restocks
      only the net after completed returns), audit entries for every mutation.
- [x] e2e: offline sale → reload → sale still there; backup → wipe DB → restore
      → totals match (e2e/durability.spec.ts).
- [x] Property-based test for return quantity math (fast-check), it's the
      fiddliest logic in the codebase (src/lib/returnMath.property.test.ts).

**Exit gate:** no float money anywhere; sales lifecycle complete; liveQuery
multi-tab consistency demonstrated by an automated test; coverage on db.ts ≥ 90%
(measured 2026-10-08 via @vitest/coverage-v8: db.ts 90.6% statements; 49 unit
+ property tests, 6 e2e tests green).

---

## Phase 2 — The architectural fork (decision, then 4–6 weeks)

**This is the decision that defines the product.** Pick one explicitly and
write it down. Everything in Phases 3–4 assumes you chose.

### Option A — "Fleet of islands" (stay local-first, add a sync spine)
Keep Dexie as the source of truth on each device; add background replication.

- **What it buys:** the offline story becomes real (POS never blocks on the
  network), multi-device reporting, central backup.
- **What it costs:** sync is genuinely hard — monotonic IDs (Lamport clocks),
  tombstones instead of deletes, last-writer-wins per field or CRDT-ish merge
  for stock counts, and a conflict UI that a cashier can understand at 6pm.
- **How:**
  - Device table in the cloud DB; every local record gets `device_id`,
    `device_seq`, `updated_at`, `deleted_at` (tombstone, never hard-delete).
  - Push/pull loop (on `online` event + interval): push `device_seq` cursor
    forward, pull changes since last-seen cursor per device.
  - Conflicts: stock counts are **additive deltas** (sales/returns are deltas,
    so they merge naturally); profile fields last-writer-wins; all conflicts
    logged to audit.
  - **Backend decision (2026-09-29): our own Postgres.** The shop's own
    Postgres server (hosted in-country or on the shop's VPS) is the sync
    target — no Supabase, no third-party BaaS. The local DB stays the source
    of truth; Postgres is a dumb, boring sync target: one schema, one sync
    endpoint, credentials in one `.env` on the server. A `docker-compose.yml`
    with Postgres + a tiny sync API is the whole infrastructure.
- **Effort:** 4–6 weeks, mostly in the conflict matrix and testing with
  flaky-network simulations (`offlineTestUtils.ts` already exists — resurrect it).

### Option B — "Honest single-device" (double down on local-only)
Drop the multi-device ambition. Make one device the till, treat it like an
appliance.

- **What it buys:** weeks of engineering saved; zero sync bugs ever.
- **What it costs:** reports/backup live on one machine; a broken phone = a
  day of restoring; no owner dashboard from home.
- **How:**
  - Mandatory auto-backup off-device (not just local rolling backups):
    daily push of the JSON snapshot to the shop's own server (plain POST to
    the sync API writing to disk/Postgres large-object).
  - "Export to accountant" becomes a first-class, tested flow (XLSX/PDF).
  - The README stops hinting at sync; TODO.md deleted (superseded by this file).

**Recommendation:** Option A **if** the real shop will ever run 2+ devices or
the owner wants off-site visibility. Option B if it's genuinely one till.
Do not drift between the two — that's what the dead `queuedSales`/
`conflicts` tables were.

### 2.x Auth grows up (both options)
- [ ] Real login (server-side auth against our own Postgres, or WebAuthn).
- [ ] PIN-per-cashier for till switching (cashiers don't type passwords).
- [ ] Role enforcement moves from UI paint (`useRole`) into the data layer:
      db.ts functions take a session and refuse unauthorized writes.
- [ ] Audit entries cryptographically chained (hash(prev_hash + entry)) so
      tampering is detectable.

**Exit gate:** a written one-page ADR naming the choice, with the sync
protocol (A) or backup topology (B) diagrammed, and auth no longer bypassable.

---

## Phase 3 — Trust and operability (3–4 weeks, overlaps Phase 2)

### 3.1 The purge the bundle deserves
- [ ] Remove react-query (provider mounted, zero `useQuery` calls), ~25 unused
      Radix packages, vaul, embla, input-otp, react-day-picker, next-themes if
      dark mode isn't actually used.
- [ ] Replace `xlsx` (902 kB chunk!) with `exceljs` or write minimal CSV/XLSX
      by hand; lazy-load jsPDF only in export flows (already chunked — shrink it).
- [ ] Target: precache **< 1 MB** from current 3.7 MB. Rural Kenyan data is not
      free; every megabyte is a real cost.
- [ ] Add `rollup-plugin-visualizer` to CI with a size budget that fails the
      build on regression.

### 3.2 Operational readiness
- [ ] Error boundary per route + global crash screen with "export backup NOW"
      button (crash-time is when data is at risk).
- [ ] Structured client logging ring-buffer (last N events in memory, dumped
      with bug reports), plus a `/healthz` static page for uptime checks.
- [ ] Update-dependency bot (Renovate/Dependabot) — `xlsx@0.18.5` is old enough
      to have known CVEs; check and pin or replace.
- [ ] Versioned DB migrations with a test that runs the full v1→current chain
      on seeded fixtures (the v5 migration deleted tables — test that path).

### 3.3 UX for the actual environment
- [ ] Low-storage warning (`navigator.storage.estimate()`) before IndexedDB
      starts dropping writes.
- [ ] First-run "this browser is now the till" onboarding; guard against a
      second device accidentally forking data (Option B) or joining a fleet
      (Option A) without an explicit flow.
- [ ] Swahili/English locale toggle; KES formatting everywhere via `Intl`.

**Exit gate:** bundle < 1 MB; crash → backup path tested; dependency bot
running; storage warnings live.

---

## Phase 4 — Wear the "production" badge (ongoing)

- [ ] **Runbook** (docs/RUNBOOK.md): backup restore drill, "browser wiped my
      data" recovery, adding a cashier, rotating devices. Rehearse the restore
      drill quarterly — an untested backup is a rumor.
- [ ] Install the PWA on real devices and put it through a week of shadow
      mode alongside the current process (paper or whatever they use now).
- [ ] KES money reports reconciled weekly against M-Pesa statement + till count.
- [ ] Uptime/error monitoring (e.g. Sentry free tier) feeding back into Phase 3
      logging.
- [ ] Postgres/storage spend alerts on the backend (Phase 2) — free tiers
      throttle silently.

---

## Suggested order of attack (next 3 concrete sessions)

1. **Session 1 (Phase 0.1–0.3):** rotate key, delete junk, `storage.persist()`,
   rolling backups, CI workflow file.
2. **Session 2 (Phase 0.4 + 1.1):** lint zero, sale lifecycle + void flow.
3. **Session 3 (Phase 1.3):** integer-cents money refactor + tests.

After that, hold the Option A/B fork until you can ask the shop owner one
question: *"Will the till ever be more than one device?"* The answer writes
the rest of the roadmap.
