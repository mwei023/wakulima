# Wakulima Smart Stock

Local-first POS + inventory for Wakulima Agrovet (Kiserian, Kenya). No third-party backend, no env config — the database is IndexedDB (Dexie) in the browser, so the app runs anywhere a static site can be served and works offline as a PWA. A future sync target is the shop's own Postgres (see ROADMAP.md).

## Stack
Vite + React + TS + Tailwind + shadcn, Dexie (IndexedDB), Zustand, VitePWA.

## Setup
1. `npm install`
2. `npm run dev` — pick Admin or Cashier on the welcome screen, no password.
3. `npm run build` — deploy `dist/` to Vercel / Netlify / GitHub Pages / any static host.

## Data model (all local)
- Products, customers, sales (atomic stock + credit checks in a Dexie transaction)
- Returns (restock on completion), stock transfers (workflow records), audit trail
- Seed data on first run; "Populate" in Inventory bulk-loads the built-in catalog (`src/data/catalog.js`)

## Scripts
- `npm run dev` / `npm run build` / `npm run lint`

## Roadmap
See [ROADMAP.md](./ROADMAP.md) for the phased plan to production readiness
(data durability, CI, sync-vs-single-device decision, bundle diet).
