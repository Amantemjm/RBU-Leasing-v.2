# RBU Leasing — Plan 7: Data Alignment & Portfolio Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the schema/UI to fit the real "Unit Lease_Residential Leasing.xlsx" data, then import the 2026 snapshot (~290 leases) as the live portfolio, replacing the demo records.

**Architecture:** Extend Prisma (`Unit.type` → free text, add `Unit.slotNo`; add descriptive text fields to `Lease`). Update Zod validation + Vue forms/lists to expose the new fields. A one-off import script reads the 2026 sheet with a per-row column-shift heuristic, cleans values, dedups owners/tenants/units, and creates records.

**Tech Stack:** Prisma 6, Zod, ExcelJS, Vue 3, Vitest + Supertest.

## Global Constraints

- Import **only the 2026 sheet** (current portfolio). Dedup owners by name, tenants by name, units by building+unitNumber. One lease per data row.
- **Column-shift heuristic:** a row whose first cell is a number has a leading row-index → shift all fields by +1; otherwise offset 0. Anchor validation on Lessee (non-empty) and Monthly Rent (numeric); skip rows failing both and report them.
- Preserve messy values as **text** (`advanceRent`, `securityDeposit`, `modeOfPayment`, `serviceFee`, `source`, `renewalPeriod`, `remarks`, `managedBy`). `monthlyRent` stays numeric `Decimal`. Lease `status` = ACTIVE if `endDate >= 2026-08-07` else EXPIRED.
- `Unit.type` becomes a free-text `String` (default "OTHER"); the `UnitType` enum is removed. `Unit.status`/`LeaseStatus`/`PaymentStatus`/`Role` enums stay.
- Wipe the existing CRUD tables (demo/test residue) before importing; never touch the `User` table.
- Prisma pinned to v6. ESM. Reuse the "Blueprint & Ledger" UI. Existing 89 server / 42 client tests must stay green. Commit after each green task.

---

## File Structure (this plan)

```
server/
  prisma/schema.prisma          MODIFY: Unit.type->String, +Unit.slotNo, +Lease text fields, drop UnitType enum
  prisma/migrations/…            NEW migration
  src/validation/unit.js         MODIFY: type->string, +slotNo
  src/validation/lease.js        MODIFY: + optional descriptive fields
  src/lib/importClean.js         NEW: cleaning/mapping helpers (pure)
  scripts/import-portfolio.js    NEW: read 2026 sheet, wipe, import
  tests/importClean.test.js      NEW
  tests/schemaFields.test.js     NEW (validation accepts new fields)
client/
  src/views/UnitFormView.vue     MODIFY: type as text, +slot no
  src/views/UnitsView.vue        MODIFY: (unchanged columns OK; type now text)
  src/views/LeaseFormView.vue    MODIFY: + descriptive fields
  src/views/LeasesView.vue       MODIFY: + a couple columns
```

---

### Task 1: Schema migration — relax Unit.type, add fields

**Files:** Modify `server/prisma/schema.prisma`; new migration.

- [ ] **Step 1: Edit the schema**

In `server/prisma/schema.prisma`: remove the `UnitType` enum block. In `model Unit`, change `type UnitType @default(OTHER)` to `type String @default("OTHER")` and add `slotNo String?`. In `model Lease`, add:

```prisma
  advanceRent    String?
  securityDeposit String?
  modeOfPayment  String?
  serviceFee     String?
  source         String?
  renewalPeriod  String?
  remarks        String?
  managedBy      String?
```

- [ ] **Step 2: Create + apply the migration**

Run: `cd server && npx prisma migrate dev --name align_to_real_data`
Expected: migration created and applied; client regenerated. (Existing rows: `type` enum→text conversion — the demo rows get wiped in Task 4 anyway.)

- [ ] **Step 3: Run the full server suite**

Run: `npm --workspace server test`
Expected: PASS — 89 (unit tests send `type:"TWO_BR"` etc., still valid as strings).

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat: relax Unit.type to free text, add slot + lease descriptive fields"
```

---

### Task 2: Validation for the new fields

**Files:** Modify `server/src/validation/unit.js`, `server/src/validation/lease.js`; create `server/tests/schemaFields.test.js`.

- [ ] **Step 1: Write the failing test**

`server/tests/schemaFields.test.js`:

```js
import { describe, it, expect } from "vitest";
import { unitCreateSchema } from "../src/validation/unit.js";
import { leaseCreateSchema } from "../src/validation/lease.js";

describe("relaxed/extended validation", () => {
  it("unit accepts free-text type and slotNo", () => {
    const d = unitCreateSchema.parse({ ownerId: "o1", unitNumber: "5A", type: "Prime Suite", slotNo: "B3-15", baseRent: 40000 });
    expect(d.type).toBe("Prime Suite");
    expect(d.slotNo).toBe("B3-15");
  });
  it("lease accepts descriptive text fields", () => {
    const d = leaseCreateSchema.parse({
      unitId: "u1", tenantId: "t1", startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 30000,
      advanceRent: "1 month", securityDeposit: "2 months", modeOfPayment: "PDC",
      serviceFee: "60,000.00 php", source: "Referral", renewalPeriod: "annual", remarks: "note", managedBy: "AAD",
    });
    expect(d.modeOfPayment).toBe("PDC");
    expect(d.managedBy).toBe("AAD");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace server test schemaFields`
Expected: FAIL — `type` enum rejects "Prime Suite" / unknown keys stripped.

- [ ] **Step 3: Implement**

`server/src/validation/unit.js` — change `type` line and add `slotNo`:

```js
import { z } from "zod";

export const unitCreateSchema = z.object({
  ownerId: z.string().min(1),
  unitNumber: z.string().min(1),
  building: z.string().nullish(),
  floor: z.string().nullish(),
  slotNo: z.string().nullish(),
  type: z.string().nullish(),
  sizeSqm: z.coerce.number().nonnegative().nullish(),
  baseRent: z.coerce.number().nonnegative(),
  status: z.enum(["VACANT", "OCCUPIED"]).optional(),
});

export const unitUpdateSchema = unitCreateSchema.partial();
```

`server/src/validation/lease.js` — add the descriptive fields:

```js
import { z } from "zod";

export const leaseCreateSchema = z.object({
  unitId: z.string().min(1),
  tenantId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.coerce.number().nonnegative(),
  deposit: z.coerce.number().nonnegative().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "TERMINATED"]).optional(),
  advanceRent: z.string().nullish(),
  securityDeposit: z.string().nullish(),
  modeOfPayment: z.string().nullish(),
  serviceFee: z.string().nullish(),
  source: z.string().nullish(),
  renewalPeriod: z.string().nullish(),
  remarks: z.string().nullish(),
  managedBy: z.string().nullish(),
});

export const leaseUpdateSchema = leaseCreateSchema.partial();
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --workspace server test schemaFields`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full server suite**

Run: `npm --workspace server test`
Expected: PASS — 91.

- [ ] **Step 6: Commit**

```bash
git add server/src/validation/unit.js server/src/validation/lease.js server/tests/schemaFields.test.js
git commit -m "feat: validation for free-text unit type and lease descriptive fields"
```

---

### Task 3: Import cleaning helpers

**Files:** Create `server/src/lib/importClean.js`, `server/tests/importClean.test.js`.

**Interfaces:**
- `rowOffset(firstCell) -> 0 | 1` — 1 if the first cell is a number (leading row index).
- `text(v) -> string|null` — trims, unwraps rich text, maps "", "-", "n/a", "N/A" → null.
- `money(v) -> number|null` — number passthrough; strips "php"/commas/spaces from strings; null if not parseable.
- `toDate(v) -> Date|null` — Date passthrough; parses ISO-ish strings; null otherwise.
- `leaseStatus(endDate, now) -> "ACTIVE"|"EXPIRED"`.
- `key(s) -> string` — normalized dedup key (lowercased, collapsed spaces).

- [ ] **Step 1: Write the failing test**

`server/tests/importClean.test.js`:

```js
import { describe, it, expect } from "vitest";
import { rowOffset, text, money, toDate, leaseStatus, key } from "../src/lib/importClean.js";

describe("importClean", () => {
  it("detects a leading row-index number", () => {
    expect(rowOffset(1)).toBe(1);
    expect(rowOffset("AAD")).toBe(0);
    expect(rowOffset(null)).toBe(0);
  });
  it("cleans text and null-ish placeholders", () => {
    expect(text("  Ibiza ")).toBe("Ibiza");
    expect(text("n/a")).toBeNull();
    expect(text("-")).toBeNull();
    expect(text("")).toBeNull();
  });
  it("parses money from numbers and messy strings", () => {
    expect(money(24000)).toBe(24000);
    expect(money("100,000.00 php")).toBe(100000);
    expect(money("2 months")).toBeNull();
  });
  it("parses dates", () => {
    expect(toDate(new Date(2026, 0, 1)).getFullYear()).toBe(2026);
    expect(toDate("2026-06-15").getMonth()).toBe(5);
    expect(toDate("garbage")).toBeNull();
  });
  it("derives lease status from end date", () => {
    const now = new Date(2026, 7, 7);
    expect(leaseStatus(new Date(2027, 0, 1), now)).toBe("ACTIVE");
    expect(leaseStatus(new Date(2025, 0, 1), now)).toBe("EXPIRED");
  });
  it("normalizes dedup keys", () => {
    expect(key("  Marybeth   Monis ")).toBe(key("marybeth monis"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --workspace server test importClean`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/src/lib/importClean.js`:

```js
export function rowOffset(firstCell) {
  return typeof firstCell === "number" ? 1 : 0;
}

const NULLISH = new Set(["", "-", "n/a", "na", "none"]);

export function text(v) {
  if (v == null) return null;
  let s = typeof v === "object" && v.text ? v.text : String(v);
  s = s.trim();
  if (NULLISH.has(s.toLowerCase())) return null;
  return s || null;
}

export function money(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/php/gi, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function toDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function leaseStatus(endDate, now) {
  return endDate.getTime() >= now.getTime() ? "ACTIVE" : "EXPIRED";
}

export function key(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --workspace server test importClean`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/importClean.js server/tests/importClean.test.js
git commit -m "feat: import cleaning helpers for the portfolio spreadsheet"
```

---

### Task 4: The import script

**Files:** Create `server/scripts/import-portfolio.js`.

**Interfaces:** `node scripts/import-portfolio.js "<xlsx path>"` — wipes CRUD tables, imports the 2026 sheet, prints counts + skipped rows.

- [ ] **Step 1: Write the script**

`server/scripts/import-portfolio.js`:

```js
import "../src/env.js";
import { createRequire } from "module";
import { prisma } from "../src/lib/prisma.js";
import { rowOffset, text, money, toDate, leaseStatus, key } from "../src/lib/importClean.js";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const NOW = new Date(2026, 7, 7); // 2026-08-07
const file = process.argv[2] || "\\\\tsclient\\C\\Users\\taguicmja\\Downloads\\Unit Lease_Residential Leasing.xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("2026");
  if (!ws) throw new Error("Sheet '2026' not found");

  console.log("Wiping existing CRUD tables…");
  await prisma.payment.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unitOwner.deleteMany();

  const owners = new Map();  // key -> id
  const tenants = new Map(); // key -> id
  const units = new Map();   // building|unit -> id
  let leases = 0, skipped = 0;
  const skips = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values;
    const off = rowOffset(v[1]);
    const g = (base) => v[base + off];

    const building = text(g(2));
    const unitNumber = text(g(3));
    const unitType = text(g(4)) || "OTHER";
    const floor = text(g(5));
    const slotNo = text(g(6));
    const lessor = text(g(7));
    const lessee = text(g(8));
    const startDate = toDate(g(9));
    const endDate = toDate(g(10));
    const renewalPeriod = text(g(11));
    const monthlyRent = money(g(12));
    const advanceRent = text(g(13));
    const securityDeposit = text(g(14));
    const modeOfPayment = text(g(15));
    const serviceFee = text(g(16));
    const source = text(g(17));
    const remarks = text(g(18));
    const managedBy = text(g(1));

    // Require the essentials to make a lease.
    if (!lessee || !unitNumber || !startDate || !endDate || monthlyRent == null) {
      if (lessee || unitNumber) { skipped++; skips.push({ row: r, lessee, unitNumber }); }
      continue;
    }

    // Owner (fallback for missing lessor)
    const ownerName = lessor || "Unknown Owner";
    let ownerId = owners.get(key(ownerName));
    if (!ownerId) {
      const o = await prisma.unitOwner.create({ data: { name: ownerName } });
      ownerId = o.id; owners.set(key(ownerName), ownerId);
    }

    // Tenant
    let tenantId = tenants.get(key(lessee));
    if (!tenantId) {
      const t = await prisma.tenant.create({ data: { name: lessee } });
      tenantId = t.id; tenants.set(key(lessee), tenantId);
    }

    // Unit (building + unitNumber)
    const uKey = `${key(building)}|${key(unitNumber)}`;
    let unitId = units.get(uKey);
    if (!unitId) {
      const u = await prisma.unit.create({
        data: {
          ownerId, unitNumber, building, floor, slotNo, type: unitType,
          baseRent: monthlyRent, status: "OCCUPIED",
        },
      });
      unitId = u.id; units.set(uKey, unitId);
    }

    await prisma.lease.create({
      data: {
        unitId, tenantId, startDate, endDate, monthlyRent,
        status: leaseStatus(endDate, NOW),
        advanceRent, securityDeposit, modeOfPayment, serviceFee, source, renewalPeriod, remarks, managedBy,
      },
    });
    leases++;
  }

  console.log(`\nImported: ${owners.size} owners, ${tenants.size} tenants, ${units.size} units, ${leases} leases.`);
  console.log(`Skipped ${skipped} incomplete rows.`);
  if (skips.length) console.log("First few skips:", skips.slice(0, 8));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the import**

Run: `cd server && node scripts/import-portfolio.js`
Expected: prints counts (roughly a few hundred leases, ~200+ units, ~200+ owners/tenants) and a small number of skipped incomplete rows.

- [ ] **Step 3: Verify counts in the DB**

Run:
```bash
cd server && node -e "import('./src/lib/prisma.js').then(async ({prisma})=>{const c={owners:await prisma.unitOwner.count(),tenants:await prisma.tenant.count(),units:await prisma.unit.count(),leases:await prisma.lease.count(),active:await prisma.lease.count({where:{status:'ACTIVE'}})};console.log(c);await prisma.\$disconnect();})"
```
Expected: non-zero counts consistent with the import summary; `active` > 0.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/import-portfolio.js
git commit -m "feat: portfolio import script for the 2026 lease sheet"
```

---

### Task 5: Surface the new fields in the UI

**Files:** Modify `client/src/views/UnitFormView.vue`, `client/src/views/LeaseFormView.vue`, `client/src/views/LeasesView.vue`.

- [ ] **Step 1: Unit form — type as free text + slot no**

In `client/src/views/UnitFormView.vue`, remove the `TYPES` constant and change the fields `computed` so `type` is a text field and add `slotNo`:

```js
const fields = computed(() => [
  { key: "ownerId", label: "Owner", type: "select", options: ownerOptions.value },
  { key: "unitNumber", label: "Unit number", type: "text" },
  { key: "building", label: "Building", type: "text" },
  { key: "floor", label: "Level", type: "text" },
  { key: "slotNo", label: "Slot no.", type: "text" },
  { key: "type", label: "Unit type", type: "text" },
  { key: "sizeSqm", label: "Size (sqm)", type: "number" },
  { key: "baseRent", label: "Base rent (PHP)", type: "number" },
  { key: "status", label: "Status", type: "select", options: STATUS },
]);
```

(Keep the `STATUS` constant; delete `TYPES`.)

- [ ] **Step 2: Lease form — descriptive fields**

In `client/src/views/LeaseFormView.vue`, extend the fields `computed` (after `deposit`):

```js
  { key: "managedBy", label: "Managed by (O-LEASE)", type: "text" },
  { key: "advanceRent", label: "Advance rent", type: "text" },
  { key: "securityDeposit", label: "Security deposit", type: "text" },
  { key: "modeOfPayment", label: "Mode of payment", type: "text" },
  { key: "serviceFee", label: "Service fee paid", type: "text" },
  { key: "source", label: "Source", type: "text" },
  { key: "renewalPeriod", label: "Renewal period", type: "text" },
  { key: "remarks", label: "Remarks", type: "text" },
```

- [ ] **Step 3: Leases list — add Source + Mode columns**

In `client/src/views/LeasesView.vue`, add to `columns` (after `monthlyRent`):

```js
  { key: "modeOfPayment", label: "Mode" },
  { key: "source", label: "Source" },
```

- [ ] **Step 4: Run the full client suite**

Run: `npm --workspace client test`
Expected: PASS — 42 (list tests unaffected; forms have no dedicated tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/UnitFormView.vue client/src/views/LeaseFormView.vue client/src/views/LeasesView.vue
git commit -m "feat(client): expose slot, type-as-text, and lease descriptive fields"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Rebuild client + restart the production server**

Run: `npm --workspace client run build` then restart the app (production mode on :5050).

- [ ] **Step 2: Verify via the dashboard API**

```bash
TOKEN=$(curl -s -X POST http://localhost:5050/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@rbu.local","password":"admin123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
curl -s http://localhost:5050/api/dashboard -H "Authorization: Bearer $TOKEN"
```
Expected: real counts — hundreds of units/leases, non-zero occupancy and monthly income.

- [ ] **Step 3: Spot-check a report**

Download the rent roll and confirm it has many rows with real tenant/owner/unit names.

- [ ] **Step 4: Browser check**

Log in, view the Dashboard (real numbers), browse Units/Leases (real records with the new fields), open a lease to see the descriptive fields.

---

## Self-Review

**Spec coverage:** User's request — load the xlsx and align the system — met: schema extended (Task 1), validation (Task 2), cleaning (Task 3), import of the 2026 snapshot with dedup + wipe (Task 4), UI surfaces the new fields (Task 5), verified end-to-end (Task 6). Only 2026 imported (no duplicates); messy values preserved as text; column-shift handled per row.

**Placeholder scan:** No TBD/TODO; every code step is complete.

**Type consistency:** `importClean` helpers' signatures match their test and the import script's usage. Lease descriptive field names match across schema (Task 1), validation (Task 2), import (Task 4), and lease form (Task 5). `Unit.type` is a string everywhere after Task 1; existing tests pass enum-valued strings which remain valid. `slotNo` added to schema + validation + unit form.

**Test count:** server 89 → +schemaFields 2 +importClean 6 = **97**. client unchanged at **42**. (The import script itself is verified by running it, not a unit test.)
