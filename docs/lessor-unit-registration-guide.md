# RBU Leasing — Lessor "Register a Unit" Simulation Guide

**Goal:** Simulate a **Lessor (Unit Owner)** self-registering, submitting a unit for lease,
and having staff approve it — plus the optional Unit Owner Acceptance Form.

**System URL:** http://localhost:5050
**Super Admin (staff):** `admin@rbu.local` / `admin123`

> **How it works.** A lessor registers their own account, submits a unit, and that unit is
> created **PENDING**. It does **not** go live until staff **approve** it. The lessor is
> always auto-scoped to their own owner record — they can only see/submit their own units.
> Estates & towers are pre-seeded (5 estates, 16 towers), so the estate→tower picker is
> populated out of the box.

---

## Roles involved

| Who | Role | How to get it | Does |
|---|---|---|---|
| **The Lessor** | `UNIT_OWNER` | self **Sign up** (or Admin creates) | Registers account, submits units, fills owner form |
| Staff | `ADMIN` (or `LEASING_OFFICER`) | seeded `admin@rbu.local` | Approves/rejects pending units |

> Note: the API allows both ADMIN and LEASING_OFFICER to approve, but the **Approvals
> screen only shows the Approve/Reject buttons to the Super Admin (ADMIN)**. Others see the
> pending list read-only. Use `admin@rbu.local` for the approval step.

---

## PART A — UI Walkthrough (click-by-click)

### Step 1 — Lessor creates a portal account
1. Open http://localhost:5050/signup.
2. Choose **Lessor (Unit Owner)**.
3. Enter **name**, **username/email**, **password** (min 6 chars) → **Sign up**.
   - This creates a `UNIT_OWNER` user **and** its linked Unit Owner record, and signs you in.
4. You land on **My Units** (empty so far). Sidebar shows **My Units**, **Register Unit**,
   **My Leases**, **Info Sheet**, **Leasing Progress**, **My Profile**.

*(Alternative entry point: from the landing page http://localhost:5050 → "I am a…" →
**Lessor** you can submit a public inquiry of type "List Unit for Lease" first. That routes
to the leasing team but is not required to register a unit — the portal signup above is the
direct path.)*

### Step 2 — Register a unit for lease
1. Click **Register Unit**.
2. Fill the form:
   - **Estate** → pick one (e.g. from the seeded list) → the **Tower** dropdown enables and
     loads that estate's towers.
   - **Tower** → pick one.
   - **Unit number** → e.g. `12A`
   - **Slot no.** → e.g. `P-14` (optional)
   - **Unit type** → e.g. `2BR` (optional, free text)
   - **Monthly Rent (PHP)** → e.g. `45000` (optional — rent is finalized at lease time)
3. Click **Submit for approval**. You'll see *"Submitted for approval"* and get redirected
   to **My Units**, where the unit shows **PENDING** approval status.

### Step 3 — Staff approves the unit
1. In a separate window, sign in as `admin@rbu.local` / `admin123`.
2. Go to **Approvals** (Pending unit approvals).
3. Find the lessor's unit → click **Approve** (or **Reject**).
   - Approve → unit `approvalStatus` becomes **APPROVED** (it's now live).
   - Reject → becomes **REJECTED**.

### Step 4 — Lessor confirms
Back in the lessor's window, refresh **My Units** — the unit now reads **APPROVED**. Done. ✅

### Step 5 (optional) — Unit Owner Acceptance Form (Info Sheet)
1. Staff first **creates** the lessor's sheet: **Lessor Sheets** screen → new sheet for that
   owner (or API `POST /api/lessor-info-sheets` with the `unitOwnerId`).
2. Lessor opens **Info Sheet** (`/app/info-sheet`) → fills the **Unit Owner Acceptance
   Form**, uses the live PDF preview, and **submits** (or uploads a filled PDF).
3. Staff reviews it → **Approved** / **Returned**.

---

## PART B — Scripted API Simulation (curl)

Reproduces the whole thing without the UI.

```bash
BASE=http://localhost:5050/api

# --- 1. Lessor self-registers (UNIT_OWNER + owner record), auto signed-in ---
SIGN=$(curl -s -X POST $BASE/auth/signup -H "Content-Type: application/json" -d '{
  "name":"Maria Santos","email":"maria","password":"lessor123","role":"UNIT_OWNER"}')
LESSOR_TOKEN=$(echo "$SIGN" | jq -r .token)
OWNER_ID=$(echo "$SIGN" | jq -r .user.unitOwnerId); echo "owner=$OWNER_ID"
LAUTH="Authorization: Bearer $LESSOR_TOKEN"

# --- pick a seeded estate + tower for the cascade ---
EST_ID=$(curl -s $BASE/estates -H "$LAUTH" | jq -r '.[0].id')
TOWER_ID=$(curl -s "$BASE/towers?estateId=$EST_ID" -H "$LAUTH" | jq -r '.[0].id')
echo "estate=$EST_ID tower=$TOWER_ID"

# --- 2. Lessor submits a unit (server forces owner + PENDING) ---
UNIT=$(curl -s -X POST $BASE/units -H "$LAUTH" -H "Content-Type: application/json" -d "{
  \"towerId\":\"$TOWER_ID\",\"unitNumber\":\"12A\",\"slotNo\":\"P-14\",
  \"type\":\"2BR\",\"baseRent\":45000}")
UNIT_ID=$(echo "$UNIT" | jq -r .id)
echo "unit=$UNIT_ID approval=$(echo "$UNIT" | jq -r .approvalStatus)"   # -> PENDING

# --- lessor sees it (auto-scoped to their own units) ---
curl -s $BASE/units -H "$LAUTH" | jq '.[] | {unitNumber,approvalStatus}'

# --- staff login ---
TOK=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@rbu.local","password":"admin123"}' | jq -r .token)
AUTH="Authorization: Bearer $TOK"

# --- 3. Staff sees pending queue, then approves ---
curl -s "$BASE/units?approvalStatus=PENDING" -H "$AUTH" | jq '.[] | {unitNumber,owner:.owner.name}'
curl -s -X PATCH $BASE/units/$UNIT_ID/approve -H "$AUTH" | jq '{unitNumber,approvalStatus}'  # -> APPROVED
# (to reject instead: PATCH $BASE/units/$UNIT_ID/reject)

# --- 4. Lessor confirms it's live ---
curl -s $BASE/units -H "$LAUTH" | jq '.[] | {unitNumber,approvalStatus}'   # -> APPROVED

# --- 5. (optional) Unit Owner Acceptance Form ---
SHEET_ID=$(curl -s -X POST $BASE/lessor-info-sheets -H "$AUTH" \
  -H "Content-Type: application/json" -d "{\"unitOwnerId\":\"$OWNER_ID\"}" | jq -r .id)
curl -s -X PATCH $BASE/lessor-info-sheets/$SHEET_ID/submit -H "$LAUTH" \
  -H "Content-Type: application/json" -d '{"data":{}}' | jq '{id,status}'   # -> SUBMITTED
curl -s -X PATCH $BASE/lessor-info-sheets/$SHEET_ID/review -H "$AUTH" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' | jq '{id,status}'
```

Expected: unit ends at `approvalStatus: "APPROVED"`, visible to both the lessor and staff.

---

## Field & rule reference

- **Unit create (lessor):** `unitNumber` is required; `towerId`, `slotNo`, `type`,
  `baseRent`, `sizeSqm`, `floor` are optional. `ownerId` is **ignored/forced** to the
  lessor's own owner; `approvalStatus` is **forced to PENDING** for owner submissions.
  `baseRent` defaults to `0` if omitted (rent is really set at lease time).
- **Estate is not stored on the unit** — the tower determines the estate, so the UI sends
  `towerId` only (the estate picker just filters towers).
- **Approval:** `PATCH /units/:id/approve` → `APPROVED`; `PATCH /units/:id/reject` →
  `REJECTED`. Route allows ADMIN + LEASING_OFFICER; the Approvals UI buttons are ADMIN-only.
- **Scoping:** a `UNIT_OWNER` only ever sees their own owner's units, leases, and payments.
- **Delete guard:** a unit with leases cannot be deleted (HTTP 409).

## Where the lessor connects to the full leasing flow
Registering a unit makes it available for lease. When staff run a leasing transaction (the
10-stage flow — see `lessee-simulation-guide.md`), they **link this lessor** to the
transaction as the `unitOwnerId` (and the unit as `unitId`) at **Unit Registration**. From
then on the lessor can watch that transaction under **Leasing Progress**, exactly like the
lessee does.

## Cleanup / re-run
- Re-run with a new signup email each time (owner records are created per signup).
- Remove a test unit: `DELETE /api/units/:id` (staff; must have no leases).
- Full DB reset (⚠ destroys all data): from `server/`, `npx prisma migrate reset --force`.
