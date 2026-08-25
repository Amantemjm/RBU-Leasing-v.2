# RBU Leasing — Lessee Journey Simulation Guide

**Goal:** Walk one lessee (prospective tenant) all the way through the 10-stage leasing
process, from a public **Inquiry** to a **Fully Executed contract** and **Completed** final
status.

**System URL:** http://localhost:5050
**Super Admin:** `admin@rbu.local` / `admin123`

> **Key concept — who drives the flow.** The transaction is a **staff-driven state
> machine**. The lessee only *initiates* (submits the inquiry), *supplies* (info sheet +
> documents), and *tracks* (portal). Staff (Super Admin or a Leasing Officer / "O‑Lease")
> accept the inquiry, register the unit, run approvals, and advance every stage. Both sides
> are needed for a full simulation.

---

## 0. Cast of characters (accounts you'll use)

| Who | Role | How to get it | Used for |
|---|---|---|---|
| Super Admin | `ADMIN` | already seeded (`admin@rbu.local` / `admin123`) | Can do *everything* — you can run the whole sim with just this account |
| Leasing Officer | `LEASING_OFFICER` | Admin → **Users** → create (optional) | Realistic "O‑Lease" who accepts inquiries & advances stages |
| **The Lessee** | `TENANT` | self **Sign up**, or Admin creates | Submits inquiry, fills forms, uploads docs, tracks progress |

You *can* simulate everything with only the Super Admin (playing both staff and lessee),
but using a separate lessee account shows the real portal experience.

---

## 1. The 10 stages (source of truth: `shared/leasingStages.js`)

| # | Stage | Advances when status = | Who acts |
|---|---|---|---|
| 1 | **Inquiry** | `Qualified` | Lessee submits · staff qualifies |
| 2 | **Accept Inquiry** | `Accepted` | Staff (O‑Lease self-assign / accept) |
| 3 | **Unit Registration** | `Unit Registered` | Staff links unit + lessee |
| 4 | **Approval** | `Approved` | Staff — 4-step routing chain |
| 5 | **Unit Shoot** | `Completed` | Staff schedules & completes |
| 6 | **Accomplishment Form** | `Accepted` | Lessee submits · staff accepts |
| 7 | **Letter of Intent (LOI)** | `Accepted` | Lessee reviews/signs · staff finalizes |
| 8 | **Unit Inspection** | `Passed` | Staff inspects |
| 9 | **Contract Signing** | `Fully Executed` | Lessee signs · staff finalizes |
| 10 | **Status (Final)** | `Completed` | Staff closes out |

**Approval routing chain (stage 4):** `Leasing → Management → Authorized Approver → Final
Approval` — each must be **Approved in order** before the stage can advance.

Stages 1 & 2 are completed **automatically** the moment staff *accepts* the inquiry — a
transaction is created and it lands ready at **Unit Registration**.

---

## PART A — UI Walkthrough (click-by-click)

### Step 1 — Lessee submits an inquiry (public, no login)
1. Open http://localhost:5050 → the **"I am a…"** landing page.
2. Click **Lessee (Prospective Tenant)**.
3. On the Quick Inquiry form:
   - **What are you interested in?** → *Residences* (or *Offices*)
   - **Inquiry type** → e.g. *Unit Availability*
   - **Full name** → e.g. `Juan dela Cruz`
   - **Email** → e.g. `juan@example.com`
   - (optional) **Additional details** → budget / move-in date
   - Tick the **consent** box → **Submit inquiry**.
4. You'll see **"Inquiry received."**

### Step 2 — Lessee creates a portal account
1. Go to http://localhost:5050/signup.
2. Choose **Lessee**, enter name / username / password (min 6 chars), submit.
   - This creates a `TENANT` user **and** its linked Tenant record, and signs you in.
3. Land on **My Lease**. In the sidebar you'll also see **Leasing Progress**,
   **Requirements**, and **Info Sheet**. (Progress is empty until staff links you — Step 4.)

> Tip: Use a private/incognito window for the lessee so you can stay logged in as staff in
> the main window.

### Step 3 — Staff accepts the inquiry (stages 1→2 auto-complete)
1. In the staff window, sign in as `admin@rbu.local` / `admin123`.
2. Go to **Inquiries**. Find Juan's inquiry.
3. Click **Accept** (self-assign). ⇒ A transaction `RBU-2026-000001` is created, Inquiry =
   *Qualified*, Accept = *Accepted*, and it now sits at **Unit Registration**.
4. Go to **Transactions** → open the new transaction to see the stage tracker.

### Step 4 — Unit Registration: link the unit + the lessee
On the transaction detail page:
1. Use **Link records** to attach:
   - a **Unit** (create one first under **Units** if none exist — needs an Owner + base rent), and
   - the **Lessee (tenant)** = Juan's tenant record (search by name).
   - *(optionally the Lessor/owner too.)*
2. Set status to **Unit Registered**, then click **Advance**. ⇒ now at **Approval**.

> Once the tenant is linked, refresh the lessee's **Leasing Progress** page — the tracker
> now appears for them.

### Step 5 — Approval (4-step routing chain)
On the transaction, open **Approval routing** and approve each step **in order**:
`Leasing` → `Management` → `Authorized Approver` → `Final Approval`.
When all four are **Approved**, the Approval stage becomes *Approved*. Click **Advance**. ⇒
**Unit Shoot**.

*(Meanwhile the lessee can upload requested documents from their Leasing Progress page — the
"Your documents" panel — and submit the Requirements/Info Sheet, see Part C.)*

### Step 6 — Unit Shoot
Set status *Scheduled* → *Completed*, then **Advance**. ⇒ **Accomplishment Form**.

### Step 7 — Accomplishment Form
Lessee completes/uploads the form; staff sets *Submitted* → *Accepted*, then **Advance**. ⇒
**Letter of Intent**.

### Step 8 — Letter of Intent (LOI)
Move through *Draft* → *For Lessee Review* → *Submitted* → *For Lessor Review* → *Accepted*,
then **Advance**. ⇒ **Unit Inspection**.

### Step 9 — Unit Inspection
Set *Scheduled* → *Passed* (or *Passed with Remarks*), then **Advance**. ⇒ **Contract
Signing**.

### Step 10 — Contract Signing
Move *Contract Preparation* → *For Lessee Signing* → *For Lessor Signing* → *Fully Executed*,
then **Advance**. ⇒ **Status (Final)**.

### Step 11 — Final Status
Set the final status to **Completed**. 🎉 The lessee's tracker now shows the full journey
complete, end to end.

---

## PART B — Scripted API Simulation (curl)

Fully reproduces the journey without the UI. Run from any shell with `curl`. Replace IDs as
noted. (`jq` optional but handy.)

```bash
BASE=http://localhost:5050/api

# --- 1. Lessee submits inquiry (public) ---
INQ=$(curl -s -X POST $BASE/inquiries -H "Content-Type: application/json" -d '{
  "category":"RESIDENCES","inquirerType":"LESSEE","inquiryType":"Unit Availability",
  "fullName":"Juan dela Cruz","email":"juan@example.com",
  "message":"2BR, move-in next month","consent":true}')
INQ_ID=$(echo "$INQ" | jq -r .id); echo "inquiry=$INQ_ID"

# --- 2. Lessee self-registers (TENANT + tenant record) ---
SIGN=$(curl -s -X POST $BASE/auth/signup -H "Content-Type: application/json" -d '{
  "name":"Juan dela Cruz","email":"juan","password":"lessee123","role":"TENANT"}')
LESSEE_TOKEN=$(echo "$SIGN" | jq -r .token)
TENANT_ID=$(echo "$SIGN" | jq -r .user.tenantId); echo "tenant=$TENANT_ID"

# --- staff login ---
ADMIN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{
  "email":"admin@rbu.local","password":"admin123"}')
TOK=$(echo "$ADMIN" | jq -r .token)
AUTH="Authorization: Bearer $TOK"

# --- 3. Staff accepts inquiry -> transaction auto-created (stages 1&2 done) ---
curl -s -X PATCH $BASE/inquiries/$INQ_ID/accept -H "$AUTH" >/dev/null
TXN=$(curl -s $BASE/leasing-transactions -H "$AUTH" | jq -r '.[0]')
TXN_ID=$(echo "$TXN" | jq -r .id); echo "txn=$TXN_ID stage=$(echo "$TXN"|jq -r .stage)"

# You need a UNIT to link. Create an owner + unit if you have none:
OWNER_ID=$(curl -s -X POST $BASE/owners -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Acme Realty"}' | jq -r .id)
UNIT_ID=$(curl -s -X POST $BASE/units -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"ownerId\":\"$OWNER_ID\",\"unitNumber\":\"12A\",\"baseRent\":45000}" | jq -r .id)

# --- 4. Unit Registration: link unit + lessee, then advance ---
curl -s -X PATCH $BASE/leasing-transactions/$TXN_ID/link -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"unitId\":\"$UNIT_ID\",\"tenantId\":\"$TENANT_ID\",\"unitOwnerId\":\"$OWNER_ID\"}" >/dev/null
curl -s -X PATCH $BASE/leasing-transactions/$TXN_ID/status -H "$AUTH" \
  -H "Content-Type: application/json" -d '{"status":"Unit Registered"}' >/dev/null
curl -s -X PATCH $BASE/leasing-transactions/$TXN_ID/advance -H "$AUTH" \
  -H "Content-Type: application/json" -d '{}' >/dev/null   # -> APPROVAL

# --- 5. Approval: approve the 4 routing steps in order ---
for STEP in $(curl -s $BASE/leasing-transactions/$TXN_ID/approval-steps -H "$AUTH" \
    | jq -r 'sort_by(.order)[].id'); do
  curl -s -X PATCH $BASE/leasing-transactions/$TXN_ID/approval-steps/$STEP -H "$AUTH" \
    -H "Content-Type: application/json" -d '{"status":"Approved"}' >/dev/null
done
curl -s -X PATCH $BASE/leasing-transactions/$TXN_ID/advance -H "$AUTH" \
  -H "Content-Type: application/json" -d '{}' >/dev/null   # -> UNIT_SHOOT

# --- 6..9. Walk the remaining stages. `advance` accepts the next stage's target status. ---
adv(){ curl -s -X PATCH $BASE/leasing-transactions/$TXN_ID/advance -H "$AUTH" \
  -H "Content-Type: application/json" -d "{\"status\":\"$1\"}" >/dev/null; }

adv "Accepted"        # UNIT_SHOOT -> ACCOMPLISHMENT_FORM (set Accepted on arrival)
adv "Accepted"        # -> LETTER_OF_INTENT
adv "Passed"          # -> UNIT_INSPECTION
adv "Fully Executed"  # -> CONTRACT_SIGNING
adv "Completed"       # -> FINAL_STATUS (final = Completed)

# --- verify ---
curl -s $BASE/leasing-transactions/$TXN_ID -H "$AUTH" \
  | jq '{reference,stage,status,finalStatus}'

# --- lessee's own portal view ---
curl -s $BASE/leasing-transactions/mine -H "Authorization: Bearer $LESSEE_TOKEN" \
  | jq '.[0] | {reference,stage,status,finalStatus}'
```

Expected final output: `stage: "FINAL_STATUS"`, `status/finalStatus: "Completed"`.

> Note on `advance`: it completes the current stage (recording its current status) and enters
> the next stage, applying the `status` you pass if it's valid for that next stage, otherwise
> the stage's initial status. That's why one `adv "<target>"` per hop is enough for a happy
> path. Use `PATCH .../status` when you want to set an intermediate status without moving on,
> and `PATCH .../return` to send the transaction back one stage (exception flow).

---

## PART C — Lessee-side actions to exercise (optional but realistic)

While staff advances the transaction, log in as the lessee and try these — they make the
simulation feel real and populate the portal:

1. **Leasing Progress** (`/app/leasing-progress`) — see the live tracker, your assigned
   leasing rep, and the next step. Upload documents in the **Your documents** panel
   (PDF/JPG/PNG/DOCX, ≤10 MB). During **Approval** it prompts for the requested requirements.
2. **Info Sheet** (`/app/info-sheet-tenant`) — the **Lessee Acceptance Form**. Staff first
   *creates* the sheet for your tenant (Lessee Sheets screen); you then fill/preview and
   **submit** it (or upload a filled PDF). Staff reviews → *Approved*/*Returned*.
3. **Requirements** (`/app/requirements`) — upload supporting documents tied to your tenant
   record; staff can view/download them.

---

## Reset / re-run tips

- Each accepted inquiry yields one transaction (`RBU-<year>-NNNNNN`). To simulate again,
  submit a fresh inquiry with a new email.
- A Super Admin can **delete** a transaction (`DELETE /api/leasing-transactions/:id`) and
  inquiries to clean up test data.
- To reset the whole database to a clean seeded state (⚠ destroys all data):
  ```bash
  cd "C:/Users/BPM/Desktop/RBU Leasing version 2/server"
  npx prisma migrate reset --force   # re-runs migrations + seed (admin only)
  ```
