# RBU Leasing — Environments

Three isolated environments on this machine. Each has its own git branch/checkout,
PostgreSQL database, port, and `server/.env`. Data is independent per environment —
**promotion moves code + schema migrations only, never data.**

| Env  | Branch   | Location (git worktree)                    | Database           | Port | URL                     |
|------|----------|--------------------------------------------|--------------------|------|-------------------------|
| Dev  | `master` | `C:\Users\BPM\Desktop\RBU Leasing App`     | `rbu_leasing`      | 5050 | http://localhost:5050   |
| QA   | `qa`     | `C:\Users\BPM\Desktop\RBU-Leasing-QA`      | `rbu_leasing_qa`   | 5060 | http://localhost:5060   |
| Prod | `prod`   | `C:\Users\BPM\Desktop\RBU-Leasing-PROD`    | `rbu_leasing_prod` | 5070 | http://localhost:5070   |

- **Dev** holds the current real portfolio; you develop here freely on `master`.
- **QA** is seeded with the imported portfolio as test data (safe to break).
- **Prod** starts with only the admin login; load real data when ready.

## Promote a version (Dev → QA → Prod)

Run from the Dev repo:

```
node ops/promote.mjs qa      # merge master -> qa, rebuild, migrate QA db
node ops/promote.mjs prod    # merge qa -> prod, rebuild, migrate Prod db
```

Then restart the target environment (see below) to serve the new version.

## Start / stop an environment (on demand)

QA:  `cd "C:\Users\BPM\Desktop\RBU-Leasing-QA\server" && node src/index.js`   (serves :5060)
Prod:`cd "C:\Users\BPM\Desktop\RBU-Leasing-PROD\server" && node src/index.js` (serves :5070)

`NODE_ENV=production` is set in each env's `.env`, so the server serves the built
client as a single deployable. Stop with Ctrl-C (or stop the service).

## Make an environment a persistent auto-start Windows Service (optional)

In an **Administrator** terminal, per environment:

```
cd "C:\Users\BPM\Desktop\RBU-Leasing-QA\server"    &&  node scripts/install-service.cjs
cd "C:\Users\BPM\Desktop\RBU-Leasing-PROD\server"  &&  node scripts/install-service.cjs
```

(The service name is set per environment via `RBU_SERVICE_NAME` in each `server/.env`.)
Open each port in the firewall if you want LAN access:

```
netsh advfirewall firewall add rule name="RBU Leasing QA 5060"   dir=in action=allow protocol=TCP localport=5060
netsh advfirewall firewall add rule name="RBU Leasing Prod 5070" dir=in action=allow protocol=TCP localport=5070
```

## First-time data

- QA test data:  `cd "...RBU-Leasing-QA\server"  && node scripts/import-portfolio.js`
- Prod real data: load when ready (import script, or a one-time copy from Dev).
