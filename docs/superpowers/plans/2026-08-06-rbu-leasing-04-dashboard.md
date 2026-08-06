# RBU Leasing — Plan 4: Dashboard Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the six live dashboard metrics (occupancy, monthly income, leases expiring soon, overdue/outstanding, new leases this month, entity counts) as tested service functions, expose them via `GET /api/dashboard`, and render them in the Vue dashboard.

**Architecture:** All derived math lives in `server/src/services/dashboardService.js`, computed from base data (leases/payments/units), never from stored status fields — matching the spec's single-source-of-truth principle so Plans 5–6 reuse it. Time-dependent functions take an injectable `now` for deterministic tests. A thin controller/route serves the aggregate; the Vue view renders metric cards.

**Tech Stack:** Node.js, Express 5, Prisma 6, PostgreSQL, Vitest + Supertest (server), Vue 3 + Vitest + @vue/test-utils (client).

## Global Constraints

- All derived math lives in `server/src/services/`; controllers stay thin. Dashboard computes from base data (leases, payments, units), NOT from stored `unit.status`.
- Occupancy is derived: a unit is occupied iff it has ≥1 lease with `status = ACTIVE`.
- Overdue is derived: a payment is overdue iff `paidDate IS NULL AND dueDate < now` (spec formula).
- Time-dependent service functions accept a `now = new Date()` parameter so tests are deterministic.
- Money columns are Prisma `Decimal`; sums use Prisma `_sum` aggregates converted to `Number`. Currency PHP (client formats via existing `formatPHP`).
- Roles: dashboard is viewable by ANY authenticated user (ADMIN, LEASING_OFFICER, VIEWER).
- Tests run against the real `rbu_leasing` DB; `server/vitest.config.js` already sets `fileParallelism:false`. Reuse `tests/helpers.js` (`resetCrudTables`, `tokens`, `factory`).
- Prisma pinned to v6. ESM throughout. Commit after each green task.

---

## File Structure (this plan)

```
server/
  src/
    lib/
      dates.js                 NEW: startOfMonth, startOfNextMonth, addDays
    services/
      dashboardService.js      NEW: per-metric fns + getDashboard(now)
    controllers/
      dashboardController.js    NEW
    routes/
      dashboardRoutes.js        NEW
    app.js                      MODIFY: mount /api/dashboard
  tests/
    dates.test.js               NEW
    dashboardOccupancy.test.js  NEW (counts + occupancy)
    dashboardIncome.test.js     NEW (monthly income + new-this-month)
    dashboardWindows.test.js    NEW (expiring + overdue + getDashboard)
    dashboardRoutes.test.js     NEW
client/
  src/
    lib/dashboard.js            NEW: fetchDashboard()
    views/DashboardView.vue     MODIFY: metric cards
  tests/
    DashboardView.test.js       NEW
```

---

### Task 1: Date helpers

**Files:**
- Create: `server/src/lib/dates.js`, `server/tests/dates.test.js`

**Interfaces:**
- Produces: `startOfMonth(d) -> Date` (first day of d's month, 00:00 local), `startOfNextMonth(d) -> Date`, `addDays(d, n) -> Date` (new Date n days after d; n may be negative).

- [ ] **Step 1: Write the failing test**

`server/tests/dates.test.js`:

```js
import { describe, it, expect } from "vitest";
import { startOfMonth, startOfNextMonth, addDays } from "../src/lib/dates.js";

describe("date helpers", () => {
  it("startOfMonth returns the first day of the month", () => {
    const d = new Date("2026-03-17T13:45:00Z");
    const s = startOfMonth(d);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(2); // March = 2
    expect(s.getDate()).toBe(1);
  });
  it("startOfNextMonth rolls over the year in December", () => {
    const d = new Date("2026-12-10T00:00:00Z");
    const s = startOfNextMonth(d);
    expect(s.getFullYear()).toBe(2027);
    expect(s.getMonth()).toBe(0); // January
    expect(s.getDate()).toBe(1);
  });
  it("addDays adds and subtracts days", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    expect(addDays(d, 10).getTime()).toBe(d.getTime() + 10 * 86400000);
    expect(addDays(d, -5).getTime()).toBe(d.getTime() - 5 * 86400000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test dates`
Expected: FAIL — cannot import `../src/lib/dates.js`.

- [ ] **Step 3: Write the implementation**

`server/src/lib/dates.js`:

```js
export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test dates`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/dates.js server/tests/dates.test.js
git commit -m "feat: date helpers for dashboard windows"
```

---

### Task 2: Counts + occupancy

**Files:**
- Create: `server/src/services/dashboardService.js`, `server/tests/dashboardOccupancy.test.js`

**Interfaces:**
- Consumes: `prisma`.
- Produces:
  - `getCounts() -> Promise<{ owners, tenants, units }>`
  - `getOccupancy() -> Promise<{ totalUnits, occupied, vacant, rate }>` — occupied = units with ≥1 ACTIVE lease; rate = occupied/totalUnits (0 when no units).

- [ ] **Step 1: Write the failing test**

`server/tests/dashboardOccupancy.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getCounts, getOccupancy } from "../src/services/dashboardService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("getCounts", () => {
  it("counts owners, tenants, and units", async () => {
    const o = await factory.owner();
    await factory.unit(o.id);
    await factory.unit(o.id, { unitNumber: "102" });
    await factory.tenant();
    const counts = await getCounts();
    expect(counts).toEqual({ owners: 1, tenants: 1, units: 2 });
  });
});

describe("getOccupancy", () => {
  it("treats a unit with an ACTIVE lease as occupied", async () => {
    const o = await factory.owner();
    const u1 = await factory.unit(o.id, { unitNumber: "A" });
    await factory.unit(o.id, { unitNumber: "B" }); // vacant
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id, { status: "ACTIVE" });
    const occ = await getOccupancy();
    expect(occ.totalUnits).toBe(2);
    expect(occ.occupied).toBe(1);
    expect(occ.vacant).toBe(1);
    expect(occ.rate).toBeCloseTo(0.5);
  });
  it("does not count EXPIRED leases as occupancy", async () => {
    const o = await factory.owner();
    const u1 = await factory.unit(o.id);
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id, { status: "EXPIRED" });
    const occ = await getOccupancy();
    expect(occ.occupied).toBe(0);
  });
  it("returns rate 0 when there are no units", async () => {
    const occ = await getOccupancy();
    expect(occ).toEqual({ totalUnits: 0, occupied: 0, vacant: 0, rate: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test dashboardOccupancy`
Expected: FAIL — cannot import `dashboardService.js`.

- [ ] **Step 3: Write the implementation**

`server/src/services/dashboardService.js`:

```js
import { prisma } from "../lib/prisma.js";

// Prisma Decimal (or null) -> Number
function num(value) {
  return value == null ? 0 : Number(value);
}

export async function getCounts() {
  const [owners, tenants, units] = await Promise.all([
    prisma.unitOwner.count(),
    prisma.tenant.count(),
    prisma.unit.count(),
  ]);
  return { owners, tenants, units };
}

export async function getOccupancy() {
  const totalUnits = await prisma.unit.count();
  const occupied = await prisma.unit.count({
    where: { leases: { some: { status: "ACTIVE" } } },
  });
  const vacant = totalUnits - occupied;
  const rate = totalUnits === 0 ? 0 : occupied / totalUnits;
  return { totalUnits, occupied, vacant, rate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test dashboardOccupancy`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardService.js server/tests/dashboardOccupancy.test.js
git commit -m "feat: dashboard counts and occupancy metrics"
```

---

### Task 3: Monthly income + new leases this month

**Files:**
- Modify: `server/src/services/dashboardService.js`
- Create: `server/tests/dashboardIncome.test.js`

**Interfaces:**
- Consumes: `prisma`, `startOfMonth`, `startOfNextMonth`, existing `num` helper.
- Produces:
  - `getMonthlyIncome() -> Promise<{ activeLeases, monthlyIncome }>` — sum of `monthlyRent` over ACTIVE leases.
  - `getNewLeasesThisMonth(now = new Date()) -> Promise<number>` — leases whose `startDate` is in `now`'s calendar month.

- [ ] **Step 1: Write the failing test**

`server/tests/dashboardIncome.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getMonthlyIncome, getNewLeasesThisMonth } from "../src/services/dashboardService.js";

beforeEach(async () => { await resetCrudTables(); });

async function unitAndTenant() {
  const o = await factory.owner();
  const u = await factory.unit(o.id);
  const t = await factory.tenant();
  return { unitId: u.id, tenantId: t.id };
}

describe("getMonthlyIncome", () => {
  it("sums monthlyRent across ACTIVE leases only", async () => {
    const { unitId, tenantId } = await unitAndTenant();
    await factory.lease(unitId, tenantId, { status: "ACTIVE", monthlyRent: 30000 });
    await factory.lease(unitId, tenantId, { status: "ACTIVE", monthlyRent: 20000 });
    await factory.lease(unitId, tenantId, { status: "TERMINATED", monthlyRent: 99999 });
    const income = await getMonthlyIncome();
    expect(income.activeLeases).toBe(2);
    expect(income.monthlyIncome).toBe(50000);
  });
  it("returns zero income when there are no active leases", async () => {
    const income = await getMonthlyIncome();
    expect(income).toEqual({ activeLeases: 0, monthlyIncome: 0 });
  });
});

describe("getNewLeasesThisMonth", () => {
  it("counts leases starting in the given month", async () => {
    const { unitId, tenantId } = await unitAndTenant();
    const now = new Date("2026-06-15T00:00:00Z");
    await factory.lease(unitId, tenantId, { startDate: new Date("2026-06-03T00:00:00Z") });
    await factory.lease(unitId, tenantId, { startDate: new Date("2026-06-28T00:00:00Z") });
    await factory.lease(unitId, tenantId, { startDate: new Date("2026-05-30T00:00:00Z") }); // prior month
    const count = await getNewLeasesThisMonth(now);
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test dashboardIncome`
Expected: FAIL — `getMonthlyIncome`/`getNewLeasesThisMonth` not exported.

- [ ] **Step 3: Write the implementation**

Add to the top imports of `server/src/services/dashboardService.js`:

```js
import { startOfMonth, startOfNextMonth } from "../lib/dates.js";
```

Append these functions to `server/src/services/dashboardService.js`:

```js
export async function getMonthlyIncome() {
  const activeLeases = await prisma.lease.count({ where: { status: "ACTIVE" } });
  const agg = await prisma.lease.aggregate({
    _sum: { monthlyRent: true },
    where: { status: "ACTIVE" },
  });
  return { activeLeases, monthlyIncome: num(agg._sum.monthlyRent) };
}

export async function getNewLeasesThisMonth(now = new Date()) {
  return prisma.lease.count({
    where: { startDate: { gte: startOfMonth(now), lt: startOfNextMonth(now) } },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test dashboardIncome`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardService.js server/tests/dashboardIncome.test.js
git commit -m "feat: dashboard monthly income and new-leases-this-month metrics"
```

---

### Task 4: Expiring windows + overdue/outstanding + getDashboard aggregate

**Files:**
- Modify: `server/src/services/dashboardService.js`
- Create: `server/tests/dashboardWindows.test.js`

**Interfaces:**
- Consumes: `prisma`, `addDays`, existing `num` helper and the Task 2–3 functions.
- Produces:
  - `getExpiringLeases(now = new Date()) -> Promise<{ within30, within60, within90 }>` — ACTIVE leases whose `endDate` falls in mutually-exclusive buckets: `[now, now+30d]`, `(now+30d, now+60d]`, `(now+60d, now+90d]`.
  - `getOverdue(now = new Date()) -> Promise<{ overdueCount, overdueAmount, outstandingAmount }>` — overdue = unpaid (`paidDate NULL`) with `dueDate < now`; outstanding = sum of all unpaid amounts.
  - `getDashboard(now = new Date()) -> Promise<{ counts, occupancy, income, expiring, overdue, newLeasesThisMonth }>`.

- [ ] **Step 1: Write the failing test**

`server/tests/dashboardWindows.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getExpiringLeases, getOverdue, getDashboard } from "../src/services/dashboardService.js";

beforeEach(async () => { await resetCrudTables(); });

async function unitAndTenant() {
  const o = await factory.owner();
  const u = await factory.unit(o.id);
  const t = await factory.tenant();
  return { unitId: u.id, tenantId: t.id };
}

const NOW = new Date("2026-06-15T00:00:00Z");

describe("getExpiringLeases", () => {
  it("buckets ACTIVE leases by end date into 30/60/90-day windows", async () => {
    const { unitId, tenantId } = await unitAndTenant();
    await factory.lease(unitId, tenantId, { status: "ACTIVE", endDate: new Date("2026-06-25T00:00:00Z") }); // +10d -> within30
    await factory.lease(unitId, tenantId, { status: "ACTIVE", endDate: new Date("2026-07-20T00:00:00Z") }); // +35d -> within60
    await factory.lease(unitId, tenantId, { status: "ACTIVE", endDate: new Date("2026-08-20T00:00:00Z") }); // +66d -> within90
    await factory.lease(unitId, tenantId, { status: "ACTIVE", endDate: new Date("2026-10-01T00:00:00Z") }); // beyond 90d
    await factory.lease(unitId, tenantId, { status: "EXPIRED", endDate: new Date("2026-06-25T00:00:00Z") }); // not ACTIVE
    const exp = await getExpiringLeases(NOW);
    expect(exp).toEqual({ within30: 1, within60: 1, within90: 1 });
  });
});

describe("getOverdue", () => {
  it("sums overdue (unpaid, past due) and all outstanding amounts", async () => {
    const { unitId, tenantId } = await unitAndTenant();
    const lease = await factory.lease(unitId, tenantId);
    // overdue: unpaid + dueDate before NOW
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date("2026-06-01T00:00:00Z"), paidDate: null });
    // unpaid but not yet due -> outstanding only
    await factory.payment(lease.id, { amount: 10000, dueDate: new Date("2026-07-01T00:00:00Z"), paidDate: null });
    // paid -> neither
    await factory.payment(lease.id, { amount: 99999, dueDate: new Date("2026-05-01T00:00:00Z"), paidDate: new Date("2026-05-02T00:00:00Z"), status: "PAID" });
    const od = await getOverdue(NOW);
    expect(od.overdueCount).toBe(1);
    expect(od.overdueAmount).toBe(25000);
    expect(od.outstandingAmount).toBe(35000);
  });
});

describe("getDashboard", () => {
  it("aggregates every metric block", async () => {
    const dash = await getDashboard(NOW);
    expect(Object.keys(dash).sort()).toEqual(
      ["counts", "expiring", "income", "newLeasesThisMonth", "occupancy", "overdue"]
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test dashboardWindows`
Expected: FAIL — `getExpiringLeases`/`getOverdue`/`getDashboard` not exported.

- [ ] **Step 3: Write the implementation**

Add to the imports of `server/src/services/dashboardService.js`:

```js
import { startOfMonth, startOfNextMonth, addDays } from "../lib/dates.js";
```

(replace the existing `dates.js` import line with this one — it now also imports `addDays`.)

Append these functions to `server/src/services/dashboardService.js`:

```js
export async function getExpiringLeases(now = new Date()) {
  const d30 = addDays(now, 30);
  const d60 = addDays(now, 60);
  const d90 = addDays(now, 90);
  const [within30, within60, within90] = await Promise.all([
    prisma.lease.count({ where: { status: "ACTIVE", endDate: { gte: now, lte: d30 } } }),
    prisma.lease.count({ where: { status: "ACTIVE", endDate: { gt: d30, lte: d60 } } }),
    prisma.lease.count({ where: { status: "ACTIVE", endDate: { gt: d60, lte: d90 } } }),
  ]);
  return { within30, within60, within90 };
}

export async function getOverdue(now = new Date()) {
  const overdueWhere = { paidDate: null, dueDate: { lt: now } };
  const [overdueCount, overdueAgg, outstandingAgg] = await Promise.all([
    prisma.payment.count({ where: overdueWhere }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: overdueWhere }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paidDate: null } }),
  ]);
  return {
    overdueCount,
    overdueAmount: num(overdueAgg._sum.amount),
    outstandingAmount: num(outstandingAgg._sum.amount),
  };
}

export async function getDashboard(now = new Date()) {
  const [counts, occupancy, income, expiring, overdue, newLeasesThisMonth] = await Promise.all([
    getCounts(),
    getOccupancy(),
    getMonthlyIncome(),
    getExpiringLeases(now),
    getOverdue(now),
    getNewLeasesThisMonth(now),
  ]);
  return { counts, occupancy, income, expiring, overdue, newLeasesThisMonth };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test dashboardWindows`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/dashboardService.js server/tests/dashboardWindows.test.js
git commit -m "feat: dashboard expiring/overdue metrics and getDashboard aggregate"
```

---

### Task 5: Dashboard API route

**Files:**
- Create: `server/src/controllers/dashboardController.js`, `server/src/routes/dashboardRoutes.js`, `server/tests/dashboardRoutes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `getDashboard`, `verifyJwt`, test `tokens`.
- Produces: `GET /api/dashboard` (any authenticated role) → the `getDashboard()` payload.

- [ ] **Step 1: Write the failing test**

`server/tests/dashboardRoutes.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/dashboard", () => {
  it("returns the metric payload for a viewer", async () => {
    const o = await factory.owner();
    await factory.unit(o.id);
    const res = await request(app).get("/api/dashboard")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body.counts.units).toBe(1);
    expect(res.body.occupancy.totalUnits).toBe(1);
    expect(res.body).toHaveProperty("expiring");
    expect(res.body).toHaveProperty("overdue");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test dashboardRoutes`
Expected: FAIL — route not mounted (404) / modules not found.

- [ ] **Step 3: Write the implementation**

`server/src/controllers/dashboardController.js`:

```js
import { getDashboard } from "../services/dashboardService.js";

export async function get(req, res, next) {
  try {
    res.json(await getDashboard());
  } catch (e) { next(e); }
}
```

`server/src/routes/dashboardRoutes.js`:

```js
import { Router } from "express";
import { get } from "../controllers/dashboardController.js";
import { verifyJwt } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", get);
export default router;
```

`server/src/app.js` — add the import alongside the other route imports:

```js
import dashboardRoutes from "./routes/dashboardRoutes.js";
```

And mount it after the payments line:

```js
  app.use("/api/dashboard", dashboardRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test dashboardRoutes`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full server suite**

Run: `npm --workspace server test`
Expected: PASS — Plan 1–2 (45) + dates (3) + occupancy (5) + income (3) + windows (3) + routes (2) = 61.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/dashboardController.js server/src/routes/dashboardRoutes.js server/src/app.js server/tests/dashboardRoutes.test.js
git commit -m "feat: dashboard API route (GET /api/dashboard)"
```

---

### Task 6: Vue dashboard view

**Files:**
- Create: `client/src/lib/dashboard.js`, `client/tests/DashboardView.test.js`
- Modify: `client/src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `api` (existing Axios instance), `formatPHP`.
- Produces: `fetchDashboard() -> Promise<dashboardPayload>`; a `DashboardView` that fetches on mount and renders six metric cards.

- [ ] **Step 1: Write the failing test**

`client/tests/DashboardView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/dashboard.js", () => ({
  fetchDashboard: vi.fn(() => Promise.resolve({
    counts: { owners: 2, tenants: 3, units: 5 },
    occupancy: { totalUnits: 5, occupied: 3, vacant: 2, rate: 0.6 },
    income: { activeLeases: 3, monthlyIncome: 90000 },
    expiring: { within30: 1, within60: 0, within90: 2 },
    overdue: { overdueCount: 1, overdueAmount: 25000, outstandingAmount: 50000 },
    newLeasesThisMonth: 4,
  })),
}));

import DashboardView from "../src/views/DashboardView.vue";

describe("DashboardView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("renders the six metric blocks from the API", async () => {
    const w = mount(DashboardView);
    await flushPromises();
    const text = w.text();
    expect(text).toContain("60%");        // occupancy rate
    expect(text).toContain("90,000");     // monthly income (PHP)
    expect(text).toContain("4");          // new leases this month
    expect(text).toContain("5 units");    // counts
    expect(text).toContain("Overdue");    // overdue block heading
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test DashboardView`
Expected: FAIL — `../src/lib/dashboard.js` not found.

- [ ] **Step 3: Write the implementation**

`client/src/lib/dashboard.js`:

```js
import { api } from "./api.js";

export function fetchDashboard() {
  return api.get("/dashboard").then((r) => r.data);
}
```

`client/src/views/DashboardView.vue` (replace the placeholder):

```vue
<script setup>
import { ref, onMounted } from "vue";
import { fetchDashboard } from "../lib/dashboard.js";
import { formatPHP } from "../lib/formatters.js";

const data = ref(null);
onMounted(async () => { data.value = await fetchDashboard(); });

function pct(rate) { return `${Math.round(rate * 100)}%`; }
</script>

<template>
  <section class="dashboard">
    <h1>Dashboard</h1>
    <div v-if="data" class="cards">
      <div class="card">
        <h2>Occupancy</h2>
        <p class="big">{{ pct(data.occupancy.rate) }}</p>
        <p>{{ data.occupancy.occupied }} of {{ data.occupancy.totalUnits }} units occupied</p>
      </div>
      <div class="card">
        <h2>Monthly income</h2>
        <p class="big">{{ formatPHP(data.income.monthlyIncome) }}</p>
        <p>{{ data.income.activeLeases }} active leases</p>
      </div>
      <div class="card">
        <h2>Leases expiring soon</h2>
        <p>≤30 days: {{ data.expiring.within30 }}</p>
        <p>31–60 days: {{ data.expiring.within60 }}</p>
        <p>61–90 days: {{ data.expiring.within90 }}</p>
      </div>
      <div class="card">
        <h2>Overdue / outstanding</h2>
        <p>{{ data.overdue.overdueCount }} overdue ({{ formatPHP(data.overdue.overdueAmount) }})</p>
        <p>Outstanding: {{ formatPHP(data.overdue.outstandingAmount) }}</p>
      </div>
      <div class="card">
        <h2>New leases this month</h2>
        <p class="big">{{ data.newLeasesThisMonth }}</p>
      </div>
      <div class="card">
        <h2>Totals</h2>
        <p>{{ data.counts.owners }} owners</p>
        <p>{{ data.counts.tenants }} tenants</p>
        <p>{{ data.counts.units }} units</p>
      </div>
    </div>
    <p v-else>Loading…</p>
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test DashboardView`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full client suite**

Run: `npm --workspace client test`
Expected: PASS — Plan 3 (37) + DashboardView (1) = 38.

- [ ] **Step 6: Browser verification**

```bash
npm run dev:server
npm run dev:client
```

Log in as `admin@rbu.local` / `admin123`; the Dashboard (landing page) shows the six metric cards populated from the data created in earlier plans (occupancy %, PHP income, counts, etc.). Navigate via in-app nav (not URL reload, since the token is in-memory).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/dashboard.js client/src/views/DashboardView.vue client/tests/DashboardView.test.js
git commit -m "feat(client): live dashboard view with six metric cards"
```

---

## Self-Review

**Spec coverage (Dashboard section):** All six metric views implemented — occupancy count+rate (Task 2) ✓, monthly rental income across active leases (Task 3) ✓, leases expiring 30/60/90 (Task 4) ✓, overdue + outstanding balance (Task 4) ✓, new leases this month (Task 3) ✓, counts of tenants/owners/units (Task 2) ✓. "All derived math lives in services" — every metric is a `dashboardService` function computed from base data; occupancy and overdue use the spec's derived definitions, not stored fields ✓. Service-layer unit tests are the highest-value tests (spec) — Tasks 1–4 are all service tests ✓. Dashboard viewable by all roles — route guards with `verifyJwt` only, no `requireRole` (Task 5) ✓.

**Placeholder scan:** No TBD/TODO. Every code step has complete code. Task 3 and Task 4 both adjust the `dates.js` import line on `dashboardService.js`; Task 4's instruction explicitly says to replace the import line to add `addDays`, avoiding a duplicate-import error.

**Type consistency:** `getDashboard` returns `{ counts, occupancy, income, expiring, overdue, newLeasesThisMonth }`; the controller passes it through; the client reads exactly those keys (`data.occupancy.rate`, `data.income.monthlyIncome`, `data.expiring.within30`, `data.overdue.overdueCount/overdueAmount/outstandingAmount`, `data.newLeasesThisMonth`, `data.counts.{owners,tenants,units}`). `num()` converts Decimal sums to Number. `factory.lease`/`factory.payment` overrides (`status`, `endDate`, `startDate`, `dueDate`, `paidDate`, `monthlyRent`, `amount`) all exist in `tests/helpers.js`.

**Test count:** server: dates 3 + occupancy 5 + income 3 + windows 3 + routes 2 = 16 new → **61 total** (was 45). client: DashboardView 1 → **38 total** (was 37).

## Later Plans (preview)

- **Plan 5 — Executive Summary:** period selection + prior-period comparison, reusing these metric functions.
- **Plan 6 — Excel reports:** rent roll, collections, lease expiry, owner statement via ExcelJS.
- **Plan 7 — Hardening:** token persistence, pagination, FK labels in list views, validation polish.
