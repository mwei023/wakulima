# Wakulima LAN Backup Receiver (ADR-001, Phase 2.1)

A ~250-line, zero-dependency Node service that runs on an **always-on computer
in the shop**, on the same router as the till. The till pushes its full JSON
snapshot here (hourly), automatically. This is the off-device copy that makes
a lost/broken till a hardware problem, not a data-loss event. **Works with no
internet at all** — LAN only.

## One-time setup (on the backup computer)

1. Install Node.js 20+.
2. Copy this repo's `server/` folder over (or the whole project).
3. Run it:
   ```bash
   BACKUP_TOKEN=<pick-a-secret> node server/backup-server.mjs
   ```
   Extras (optional env): `PORT` (default 8787), `BACKUP_DIR`
   (default `./backups`), `MAX_SNAPSHOTS` (default 30).

The console prints its address, e.g. `http://0.0.0.0:8787`.

## Router settings (once)

- DHCP-reserve the backup computer's IP (e.g. `192.168.1.10`) so it never changes.
- Make sure AP/Client **isolation is OFF** (device-to-device traffic allowed).
- Allow the port in the backup computer's firewall (inbound 8787 TCP).

## Till settings (once)

Settings tab → "Off-device backup (shop network)":
- Receiver URL: `http://192.168.1.10:8787`
- Backup token: the same `BACKUP_TOKEN`
- Save, then **Push backup now** to test — success toast means done. From then
  on pushes happen automatically (hourly, plus on app open / tab return).

## What it stores

Plain files in `BACKUP_DIR`:
- `latest.json` — the newest snapshot (a replacement till restores from this).
- `snapshot-<timestamp>.json` — every push, pruned to `MAX_SNAPSHOTS`.

Endpoints: `POST /backup` (push), `GET /latest` (restore), `GET /health`,
`GET /snapshots`. Writes require the `x-backup-token` header.

## Recovery drill (do quarterly)

1. On a spare browser/device: open the PWA (it will seed and show demo data).
2. Backup tab → *Restore from Backup File* → pick `latest.json` from
   `BACKUP_DIR`.
3. Confirm. Sales, customers, credit balances and the receipt counter return
   exactly (proven by `src/lib/receiver.integration.test.ts`).

If the shop later gets a VPS (ADR-001 stage 2), the same `latest.json` can be
shipped there nightly — the receiver is deliberately boring on purpose.
