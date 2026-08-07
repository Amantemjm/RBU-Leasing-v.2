# RBU Leasing — Plan 6: Excel Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate four downloadable Excel reports — Rent Roll, Collections, Lease Expiry, Owner Statement — from tested row-builder services, served as `.xlsx` attachments and downloaded from the client with the auth token attached.

**Architecture:** Row data comes from `server/src/services/reportService.js` (single source of truth, computed from base data, reusing Plan 5's `periodRange`). A `server/src/lib/excel.js` helper turns column defs + rows into an ExcelJS workbook buffer. Thin controllers stream the buffer as an attachment; the client fetches it as a blob (so the JWT header is sent) and triggers a browser download.

**Tech Stack:** Node.js, Express 5, Prisma 6, ExcelJS, Zod, Vitest + Supertest (server); Vue 3 + Vitest + @vue/test-utils (client).

## Global Constraints

- All derived math / report rows live in `server/src/services/`; controllers stay thin. Rows are computed from base data (leases, payments, units, owners).
- Reports are viewable by ANY authenticated user (ADMIN, LEASING_OFFICER, VIEWER) — `verifyJwt` only.
- Money columns are Prisma `Decimal`; convert to `Number` in the service. Currency PHP.
- Rent Roll balance = Σ `amount` of a lease's unpaid payments (`paidDate = null`). Collections = payments with `paidDate` in the selected period. Lease Expiry = ACTIVE leases with `endDate` within N days. Owner Statement gross income = Σ ACTIVE-lease `monthlyRent` across an owner's units.
- Downloads are authenticated: the client fetches with axios (`responseType: "blob"`, token via the existing interceptor), NOT a bare `<a href>` (which cannot send the Authorization header).
- Response headers: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="<name>.xlsx"`.
- Tests run against the real `rbu_leasing` DB; `server/vitest.config.js` sets `fileParallelism:false`. Reuse `tests/helpers.js`. Reuse the "Blueprint & Ledger" client design system.
- Prisma pinned to v6. ESM throughout. Commit after each green task.

---

## File Structure (this plan)

```
server/
  src/
    lib/excel.js                NEW: buildWorkbook({ sheetName, columns, rows }) -> Buffer
    services/reportService.js    NEW: rentRollRows, collectionsRows, leaseExpiryRows, ownerStatementRows
    controllers/reportController.js  NEW: 4 handlers
    routes/reportRoutes.js       NEW: 4 GET endpoints
    app.js                       MODIFY: mount /api/reports
  tests/
    excel.test.js                NEW
    reportRentRoll.test.js       NEW
    reportCollections.test.js    NEW  (collections + lease expiry)
    reportOwnerStatement.test.js NEW
    reportRoutes.test.js         NEW
client/
  src/
    lib/reports.js               NEW: downloadReport + reports.{rentRoll,collections,leaseExpiry,ownerStatement}
    views/ReportsView.vue        NEW
    components/AppLayout.vue       MODIFY: add "Reports" nav link
    router/index.js              MODIFY: add /reports route
  tests/
    ReportsView.test.js          NEW
```

---

### Task 1: ExcelJS workbook helper

**Files:**
- Create: `server/src/lib/excel.js`, `server/tests/excel.test.js`

**Interfaces:**
- Produces: `buildWorkbook({ sheetName, columns, rows }) -> Promise<Buffer>` — `columns` is `[{ header, key, width? }]`; the first sheet row is the header, followed by one row per `rows` object keyed by `column.key`.

- [ ] **Step 1: Install ExcelJS**

```bash
npm --workspace server install exceljs
```

- [ ] **Step 2: Write the failing test**

`server/tests/excel.test.js`:

```js
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel.js";

describe("buildWorkbook", () => {
  it("produces an xlsx buffer with a header row and one row per record", async () => {
    const buf = await buildWorkbook({
      sheetName: "Test",
      columns: [{ header: "Name", key: "name" }, { header: "Amount", key: "amount" }],
      rows: [{ name: "Ayala", amount: 100 }, { name: "SM", amount: 200 }],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 2).toString()).toBe("PK"); // xlsx is a zip

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Test");
    expect(ws.getRow(1).getCell(1).value).toBe("Name");
    expect(ws.getRow(1).getCell(2).value).toBe("Amount");
    expect(ws.getRow(2).getCell(1).value).toBe("Ayala");
    expect(ws.getRow(3).getCell(2).value).toBe(200);
    expect(ws.rowCount).toBe(3); // header + 2
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace server test excel`
Expected: FAIL — cannot import `../src/lib/excel.js`.

- [ ] **Step 4: Write the implementation**

`server/src/lib/excel.js`:

```js
import ExcelJS from "exceljs";

export async function buildWorkbook({ sheetName, columns, rows }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace server test excel`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/excel.js server/tests/excel.test.js server/package.json package-lock.json
git commit -m "feat: exceljs workbook builder helper"
```

---

### Task 2: Rent Roll + Collections row builders

**Files:**
- Create: `server/src/services/reportService.js`, `server/tests/reportRentRoll.test.js`, `server/tests/reportCollections.test.js`

**Interfaces:**
- Consumes: `prisma`, `periodRange` (from `summaryService.js`).
- Produces:
  - `rentRollRows() -> Promise<Array<{ tenant, unit, owner, monthlyRent, startDate, endDate, balance }>>` — ACTIVE leases; `balance` = Σ unpaid payment amounts.
  - `collectionsRows(range) -> Promise<Array<{ paidDate, tenant, unit, amount, method }>>` — payments with `paidDate` in `{start,end}`.

- [ ] **Step 1: Write the failing tests**

`server/tests/reportRentRoll.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { rentRollRows } from "../src/services/reportService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("rentRollRows", () => {
  it("lists active leases with tenant/unit/owner and unpaid balance", async () => {
    const o = await factory.owner({ name: "Ortigas Land" });
    const u = await factory.unit(o.id, { unitNumber: "12A" });
    const t = await factory.tenant({ name: "Maria Santos" });
    const lease = await factory.lease(u.id, t.id, { status: "ACTIVE", monthlyRent: 30000 });
    await factory.payment(lease.id, { amount: 30000, paidDate: null });                          // unpaid -> balance
    await factory.payment(lease.id, { amount: 30000, paidDate: new Date(2026, 0, 10) });          // paid -> not counted

    const rows = await rentRollRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant: "Maria Santos", unit: "12A", owner: "Ortigas Land",
      monthlyRent: 30000, balance: 30000,
    });
  });

  it("excludes non-active leases", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();
    await factory.lease(u.id, t.id, { status: "TERMINATED" });
    expect(await rentRollRows()).toHaveLength(0);
  });
});
```

`server/tests/reportCollections.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { collectionsRows } from "../src/services/reportService.js";
import { periodRange } from "../src/services/summaryService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("collectionsRows", () => {
  it("lists payments paid within the period", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { unitNumber: "5B" });
    const t = await factory.tenant({ name: "Juan Cruz" });
    const lease = await factory.lease(u.id, t.id);
    await factory.payment(lease.id, { amount: 25000, paidDate: new Date(2026, 5, 10), method: "GCASH" }); // June -> in
    await factory.payment(lease.id, { amount: 99999, paidDate: new Date(2026, 4, 10) });                   // May -> out
    await factory.payment(lease.id, { amount: 88888, paidDate: null });                                    // unpaid -> out

    const rows = await collectionsRows(periodRange("month", new Date(2026, 5, 15)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant: "Juan Cruz", unit: "5B", amount: 25000, method: "GCASH" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace server test reportRentRoll reportCollections`
Expected: FAIL — cannot import `reportService.js`.

- [ ] **Step 3: Write the implementation**

`server/src/services/reportService.js`:

```js
import { prisma } from "../lib/prisma.js";

function num(value) {
  return value == null ? 0 : Number(value);
}

export async function rentRollRows() {
  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE" },
    include: { unit: { include: { owner: true } }, tenant: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  return leases.map((l) => ({
    tenant: l.tenant.name,
    unit: l.unit.unitNumber,
    owner: l.unit.owner.name,
    monthlyRent: num(l.monthlyRent),
    startDate: l.startDate,
    endDate: l.endDate,
    balance: l.payments.filter((p) => p.paidDate == null).reduce((s, p) => s + num(p.amount), 0),
  }));
}

export async function collectionsRows({ start, end }) {
  const payments = await prisma.payment.findMany({
    where: { paidDate: { gte: start, lt: end } },
    include: { lease: { include: { tenant: true, unit: true } } },
    orderBy: { paidDate: "asc" },
  });
  return payments.map((p) => ({
    paidDate: p.paidDate,
    tenant: p.lease.tenant.name,
    unit: p.lease.unit.unitNumber,
    amount: num(p.amount),
    method: p.method || "",
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace server test reportRentRoll reportCollections`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/reportService.js server/tests/reportRentRoll.test.js server/tests/reportCollections.test.js
git commit -m "feat: rent roll and collections report row builders"
```

---

### Task 3: Lease Expiry + Owner Statement row builders

**Files:**
- Modify: `server/src/services/reportService.js`
- Create: `server/tests/reportOwnerStatement.test.js` (covers lease expiry + owner statement)

**Interfaces:**
- Consumes: `prisma`, `addDays` (from `lib/dates.js`), existing `num`.
- Produces:
  - `leaseExpiryRows(now, days) -> Promise<Array<{ tenant, unit, owner, endDate, daysRemaining, monthlyRent }>>` — ACTIVE leases with `endDate` in `[now, now+days]`.
  - `ownerStatementRows() -> Promise<Array<{ owner, units, occupied, occupancyRate, grossMonthlyIncome }>>`.

- [ ] **Step 1: Write the failing test**

`server/tests/reportOwnerStatement.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { leaseExpiryRows, ownerStatementRows } from "../src/services/reportService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("leaseExpiryRows", () => {
  it("lists active leases ending within the window with days remaining", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { unitNumber: "9C" });
    const t = await factory.tenant({ name: "Ana Reyes" });
    const now = new Date(2026, 5, 1);
    await factory.lease(u.id, t.id, { status: "ACTIVE", endDate: new Date(2026, 5, 21) }); // +20d -> in 90d window
    await factory.lease(u.id, t.id, { status: "ACTIVE", endDate: new Date(2026, 11, 1) }); // beyond 90d
    await factory.lease(u.id, t.id, { status: "EXPIRED", endDate: new Date(2026, 5, 10) }); // not active

    const rows = await leaseExpiryRows(now, 90);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant: "Ana Reyes", unit: "9C", daysRemaining: 20 });
  });
});

describe("ownerStatementRows", () => {
  it("summarizes units, occupancy, and gross income per owner", async () => {
    const o = await factory.owner({ name: "Ortigas Land" });
    const u1 = await factory.unit(o.id, { unitNumber: "1" });
    await factory.unit(o.id, { unitNumber: "2" }); // vacant
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id, { status: "ACTIVE", monthlyRent: 40000 });

    const rows = await ownerStatementRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      owner: "Ortigas Land", units: 2, occupied: 1, grossMonthlyIncome: 40000,
    });
    expect(rows[0].occupancyRate).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test reportOwnerStatement`
Expected: FAIL — `leaseExpiryRows`/`ownerStatementRows` not exported.

- [ ] **Step 3: Write the implementation**

Add to the imports of `server/src/services/reportService.js`:

```js
import { addDays } from "../lib/dates.js";
```

Append to `server/src/services/reportService.js`:

```js
export async function leaseExpiryRows(now, days) {
  const until = addDays(now, days);
  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE", endDate: { gte: now, lte: until } },
    include: { unit: { include: { owner: true } }, tenant: true },
    orderBy: { endDate: "asc" },
  });
  return leases.map((l) => ({
    tenant: l.tenant.name,
    unit: l.unit.unitNumber,
    owner: l.unit.owner.name,
    endDate: l.endDate,
    daysRemaining: Math.round((l.endDate.getTime() - now.getTime()) / 86400000),
    monthlyRent: num(l.monthlyRent),
  }));
}

export async function ownerStatementRows() {
  const owners = await prisma.unitOwner.findMany({
    include: { units: { include: { leases: true } } },
    orderBy: { name: "asc" },
  });
  return owners.map((o) => {
    const units = o.units.length;
    const occupied = o.units.filter((u) => u.leases.some((l) => l.status === "ACTIVE")).length;
    const grossMonthlyIncome = o.units.reduce(
      (sum, u) => sum + u.leases.filter((l) => l.status === "ACTIVE").reduce((a, l) => a + num(l.monthlyRent), 0),
      0,
    );
    return {
      owner: o.name,
      units,
      occupied,
      occupancyRate: units === 0 ? 0 : occupied / units,
      grossMonthlyIncome,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test reportOwnerStatement`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/reportService.js server/tests/reportOwnerStatement.test.js
git commit -m "feat: lease expiry and owner statement report row builders"
```

---

### Task 4: Report download routes

**Files:**
- Create: `server/src/controllers/reportController.js`, `server/src/routes/reportRoutes.js`, `server/tests/reportRoutes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: report row builders, `buildWorkbook`, `periodRange`, `verifyJwt`, `zod`.
- Produces: `GET /api/reports/rent-roll`, `/collections?period=&date=`, `/lease-expiry?days=`, `/owner-statement` — each returns an `.xlsx` attachment (any authenticated role).

- [ ] **Step 1: Write the failing test**

`server/tests/reportRoutes.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

function binaryParser(res, cb) {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => cb(null, Buffer.from(data, "binary")));
}

async function seed() {
  const o = await factory.owner();
  const u = await factory.unit(o.id);
  const t = await factory.tenant();
  const lease = await factory.lease(u.id, t.id);
  await factory.payment(lease.id, { amount: 25000, paidDate: new Date(2026, 5, 10) });
}

describe("report downloads", () => {
  for (const path of ["rent-roll", "collections", "lease-expiry", "owner-statement"]) {
    it(`GET /api/reports/${path} returns an xlsx attachment`, async () => {
      await seed();
      const res = await request(app).get(`/api/reports/${path}`)
        .set("Authorization", `Bearer ${tokens.viewer()}`)
        .buffer().parse(binaryParser);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("spreadsheetml");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.slice(0, 2).toString()).toBe("PK");
    });
  }

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/reports/rent-roll");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test reportRoutes`
Expected: FAIL — routes not mounted / modules not found.

- [ ] **Step 3: Write the implementation**

`server/src/controllers/reportController.js`:

```js
import { z } from "zod";
import { buildWorkbook } from "../lib/excel.js";
import { periodRange } from "../services/summaryService.js";
import {
  rentRollRows, collectionsRows, leaseExpiryRows, ownerStatementRows,
} from "../services/reportService.js";

function sendXlsx(res, filename, buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

const collectionsQuery = z.object({
  period: z.enum(["month", "quarter", "year"]).optional(),
  date: z.coerce.date().optional(),
});
const expiryQuery = z.object({ days: z.coerce.number().int().positive().optional() });

export async function rentRoll(req, res, next) {
  try {
    const rows = await rentRollRows();
    const buffer = await buildWorkbook({
      sheetName: "Rent Roll",
      columns: [
        { header: "Tenant", key: "tenant", width: 24 },
        { header: "Unit", key: "unit" },
        { header: "Owner", key: "owner", width: 24 },
        { header: "Monthly Rent", key: "monthlyRent" },
        { header: "Start", key: "startDate" },
        { header: "End", key: "endDate" },
        { header: "Balance", key: "balance" },
      ],
      rows,
    });
    sendXlsx(res, "rent-roll.xlsx", buffer);
  } catch (e) { next(e); }
}

export async function collections(req, res, next) {
  try {
    const { period, date } = collectionsQuery.parse(req.query);
    const range = periodRange(period || "month", date || new Date());
    const rows = await collectionsRows(range);
    const buffer = await buildWorkbook({
      sheetName: "Collections",
      columns: [
        { header: "Paid Date", key: "paidDate" },
        { header: "Tenant", key: "tenant", width: 24 },
        { header: "Unit", key: "unit" },
        { header: "Amount", key: "amount" },
        { header: "Method", key: "method" },
      ],
      rows,
    });
    sendXlsx(res, "collections.xlsx", buffer);
  } catch (e) { next(e); }
}

export async function leaseExpiry(req, res, next) {
  try {
    const { days } = expiryQuery.parse(req.query);
    const rows = await leaseExpiryRows(new Date(), days || 90);
    const buffer = await buildWorkbook({
      sheetName: "Lease Expiry",
      columns: [
        { header: "Tenant", key: "tenant", width: 24 },
        { header: "Unit", key: "unit" },
        { header: "Owner", key: "owner", width: 24 },
        { header: "End Date", key: "endDate" },
        { header: "Days Remaining", key: "daysRemaining" },
        { header: "Monthly Rent", key: "monthlyRent" },
      ],
      rows,
    });
    sendXlsx(res, "lease-expiry.xlsx", buffer);
  } catch (e) { next(e); }
}

export async function ownerStatement(req, res, next) {
  try {
    const rows = await ownerStatementRows();
    const buffer = await buildWorkbook({
      sheetName: "Owner Statement",
      columns: [
        { header: "Owner", key: "owner", width: 28 },
        { header: "Units", key: "units" },
        { header: "Occupied", key: "occupied" },
        { header: "Occupancy Rate", key: "occupancyRate" },
        { header: "Gross Monthly Income", key: "grossMonthlyIncome", width: 20 },
      ],
      rows,
    });
    sendXlsx(res, "owner-statement.xlsx", buffer);
  } catch (e) { next(e); }
}
```

`server/src/routes/reportRoutes.js`:

```js
import { Router } from "express";
import { verifyJwt } from "../middleware/auth.js";
import { rentRoll, collections, leaseExpiry, ownerStatement } from "../controllers/reportController.js";

const router = Router();
router.use(verifyJwt);
router.get("/rent-roll", rentRoll);
router.get("/collections", collections);
router.get("/lease-expiry", leaseExpiry);
router.get("/owner-statement", ownerStatement);
export default router;
```

`server/src/app.js` — add the import alongside the other route imports:

```js
import reportRoutes from "./routes/reportRoutes.js";
```

And mount it after the summary line:

```js
  app.use("/api/reports", reportRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test reportRoutes`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full server suite**

Run: `npm --workspace server test`
Expected: PASS — Plan 1–5 (78) + excel (1) + rentRoll (2) + collections (1) + ownerStatement (2) + reportRoutes (5) = 89.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/reportController.js server/src/routes/reportRoutes.js server/src/app.js server/tests/reportRoutes.test.js
git commit -m "feat: excel report download routes (/api/reports/*)"
```

---

### Task 5: Vue Reports view

**Files:**
- Create: `client/src/lib/reports.js`, `client/src/views/ReportsView.vue`, `client/tests/ReportsView.test.js`
- Modify: `client/src/components/AppLayout.vue`, `client/src/router/index.js`

**Interfaces:**
- Consumes: `api`.
- Produces: `downloadReport(path, params, filename)` + `reports.{rentRoll, collections, leaseExpiry, ownerStatement}`; a `ReportsView` with a Download button per report; a `/reports` route and "Reports" nav link.

- [ ] **Step 1: Write the failing test**

`client/tests/ReportsView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/reports.js", () => ({
  reports: {
    rentRoll: vi.fn(() => Promise.resolve()),
    collections: vi.fn(() => Promise.resolve()),
    leaseExpiry: vi.fn(() => Promise.resolve()),
    ownerStatement: vi.fn(() => Promise.resolve()),
  },
}));

import ReportsView from "../src/views/ReportsView.vue";
import { reports } from "../src/lib/reports.js";

describe("ReportsView", () => {
  beforeEach(() => { Object.values(reports).forEach((f) => f.mockClear()); });

  it("downloads the rent roll when its button is clicked", async () => {
    const w = mount(ReportsView);
    const btn = w.findAll("button").find((b) => b.text().includes("Rent Roll"));
    await btn.trigger("click");
    await flushPromises();
    expect(reports.rentRoll).toHaveBeenCalled();
  });

  it("downloads lease expiry with the chosen window", async () => {
    const w = mount(ReportsView);
    const input = w.find('input[type="number"]');
    await input.setValue(30);
    const btn = w.findAll("button").find((b) => b.text().includes("Lease Expiry"));
    await btn.trigger("click");
    await flushPromises();
    expect(reports.leaseExpiry).toHaveBeenCalledWith(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test ReportsView`
Expected: FAIL — `../src/lib/reports.js` / `ReportsView.vue` not found.

- [ ] **Step 3: Write the implementation**

`client/src/lib/reports.js`:

```js
import { api } from "./api.js";

export async function downloadReport(path, params, filename) {
  const res = await api.get(path, { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const reports = {
  rentRoll: () => downloadReport("/reports/rent-roll", {}, "rent-roll.xlsx"),
  collections: (period, date) => downloadReport("/reports/collections", { period, date }, "collections.xlsx"),
  leaseExpiry: (days) => downloadReport("/reports/lease-expiry", { days }, "lease-expiry.xlsx"),
  ownerStatement: () => downloadReport("/reports/owner-statement", {}, "owner-statement.xlsx"),
};
```

`client/src/views/ReportsView.vue`:

```vue
<script setup>
import { ref } from "vue";
import { reports } from "../lib/reports.js";

const period = ref("month");
const days = ref(90);
const periods = ["month", "quarter", "year"];
</script>

<template>
  <section class="reports">
    <h1>Reports</h1>
    <div class="cards">
      <div class="card">
        <h2>Rent Roll</h2>
        <p>All active leases with tenant, unit, owner, rent, term, and balance.</p>
        <button type="button" @click="reports.rentRoll()">Download Rent Roll</button>
      </div>

      <div class="card">
        <h2>Collections</h2>
        <p>Payments received in a selected period.</p>
        <label class="inline">Period
          <select v-model="period">
            <option v-for="p in periods" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
        <button type="button" @click="reports.collections(period)">Download Collections</button>
      </div>

      <div class="card">
        <h2>Lease Expiry</h2>
        <p>Active leases expiring within a window.</p>
        <label class="inline">Days
          <input type="number" v-model.number="days" min="1" />
        </label>
        <button type="button" @click="reports.leaseExpiry(days)">Download Lease Expiry</button>
      </div>

      <div class="card">
        <h2>Owner Statement</h2>
        <p>Per owner: units, occupancy, and gross monthly income.</p>
        <button type="button" @click="reports.ownerStatement()">Download Owner Statement</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reports h1 {
  font-family: var(--display);
  font-size: 1.9rem;
  font-weight: 500;
  margin-bottom: 1.5rem;
}
.card h2 { text-transform: none; letter-spacing: 0; font-size: 1.05rem; color: var(--ink-800); margin-bottom: 0.5rem; }
.card p { margin-bottom: 1rem; }
.card .inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 1rem;
}
.card .inline select,
.card .inline input {
  font-family: inherit;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  text-transform: none;
  letter-spacing: 0;
}
.card .inline input { width: 5rem; }
.reports .card button {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.reports .card button:hover { background: var(--accent-600); }
</style>
```

`client/src/components/AppLayout.vue` — add a "Reports" link to the `links` array, after "Summary":

```js
const links = [
  { to: "/", label: "Dashboard" },
  { to: "/summary", label: "Summary" },
  { to: "/reports", label: "Reports" },
  { to: "/owners", label: "Owners" },
  { to: "/units", label: "Units" },
  { to: "/tenants", label: "Tenants" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];
```

`client/src/router/index.js` — add the import with the other view imports:

```js
import ReportsView from "../views/ReportsView.vue";
```

And add the child route after the summary child:

```js
      { path: "reports", component: ReportsView },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test ReportsView`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full client suite**

Run: `npm --workspace client test`
Expected: PASS — Plan 3–5 (40) + ReportsView (2) = 42.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/reports.js client/src/views/ReportsView.vue client/src/components/AppLayout.vue client/src/router/index.js client/tests/ReportsView.test.js
git commit -m "feat(client): reports view with authenticated xlsx downloads"
```

---

### Task 6: End-to-end download verification

**Files:**
- None (verification task).

**Interfaces:**
- Consumes: the running server. Proves each endpoint returns a valid, openable `.xlsx`.

- [ ] **Step 1: Start the API server**

```bash
npm run dev:server
```

- [ ] **Step 2: Download each report with a real token and confirm it is a valid xlsx**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@rbu.local","password":"admin123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
for r in rent-roll collections lease-expiry owner-statement; do
  curl -s "http://localhost:4000/api/reports/$r" -H "Authorization: Bearer $TOKEN" -o "/tmp/$r.xlsx"
  node -e "const ExcelJS=require('./server/node_modules/exceljs');const wb=new ExcelJS.Workbook();wb.xlsx.readFile('/tmp/$r.xlsx').then(()=>console.log('$r.xlsx OK, sheets:',wb.worksheets.map(w=>w.name)))"
done
```

Expected: each prints `<report>.xlsx OK, sheets: [ '<Sheet Name>' ]`, confirming a valid workbook.

- [ ] **Step 3: (Optional) Browser check**

Log in, click **Reports** in the sidebar, click a Download button, confirm the browser saves the `.xlsx` and it opens in a spreadsheet app.

- [ ] **Step 4: No code changes expected**

If Steps 1–3 surface a bug, fix it test-first before completing the plan.

---

## Self-Review

**Spec coverage (Reports section):** All four reports implemented — Rent Roll (Task 2), Collections (Task 2), Lease Expiry (Task 3), Owner Statement (Task 3) — each a downloadable `.xlsx` via ExcelJS (Task 1 helper, Task 4 routes) ✓. Rent roll fields tenant/unit/owner/monthly rent/term/balance ✓; collections = payments in a selected period ✓; lease expiry within a window ✓; owner statement per owner: units, gross income, occupancy ✓. Row builders live in `reportService` (single source of truth) ✓. Reports viewable by all roles — `verifyJwt` only (Task 4) ✓.

**Placeholder scan:** No TBD/TODO. Every code step is complete. Task 4 gives exact `app.js` import + mount lines; Task 5 gives the exact `links` array and router edits.

**Type consistency:** Row-builder object keys match the controllers' `columns[].key` for each report (tenant/unit/owner/monthlyRent/startDate/endDate/balance; paidDate/tenant/unit/amount/method; tenant/unit/owner/endDate/daysRemaining/monthlyRent; owner/units/occupied/occupancyRate/grossMonthlyIncome). `collectionsRows` takes a `{start,end}` range from `periodRange` (Plan 5). `buildWorkbook({ sheetName, columns, rows })` signature used consistently. Client `reports.leaseExpiry(days)` matches the test's `toHaveBeenCalledWith(30)`. `factory` overrides used all exist in `tests/helpers.js`.

**Test count:** server: excel 1 + rentRoll 2 + collections 1 + ownerStatement 2 + reportRoutes 5 = 11 new → **89 total** (was 78). client: ReportsView 2 → **42 total** (was 40).

## Later Plans (preview)

- **Plan 7 — Hardening:** token persistence (localStorage), pagination on list views, FK labels (owner/tenant names in Units/Leases/Payments lists instead of IDs), self-hosted fonts, optional `terminatedAt` field, number/currency formatting inside the Excel cells.
