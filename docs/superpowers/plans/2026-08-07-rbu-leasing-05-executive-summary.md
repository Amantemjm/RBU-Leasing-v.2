# RBU Leasing — Plan 5: Executive Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a period-based Executive Summary — the user picks month/quarter/year and sees that period's income, collections (expected vs collected), occupancy, new leases, and terminated leases, each compared against the immediately prior period with delta indicators.

**Architecture:** Period math lives in a new `server/src/services/summaryService.js` (single source of truth), reusing `lib/dates.js` (extended with quarter/year helpers). Time-dependent functions take an injectable anchor for deterministic tests. A thin controller/route serves the aggregate; a Vue view with a period selector renders a this-vs-prior comparison table.

**Tech Stack:** Node.js, Express 5, Prisma 6, Zod, Vitest + Supertest (server); Vue 3 + Vitest + @vue/test-utils (client).

## Global Constraints

- All derived math lives in `server/src/services/`; controllers stay thin. Summary math is computed from base data (payments, leases, units).
- Definitions: **income (collected)** = Σ `payment.amount` with `paidDate` in period; **expected** = Σ `payment.amount` with `dueDate` in period; **collection rate** = collected/expected (0 if nothing due); **occupancy rate** = units with an ACTIVE lease covering the period's last day ÷ total units; **new leases** = `startDate` in period; **terminated leases** = `status = TERMINATED` with `endDate` in period.
- Periods are calendar month / quarter / year; comparison is always against the immediately prior period of the same type.
- Time-dependent functions accept an `anchor`/`type` argument so tests are deterministic. Tests construct dates with the numeric `new Date(y, m, d)` (local) constructor to match the local-based date helpers.
- Money columns are Prisma `Decimal`; sums use `_sum` aggregates converted to `Number`. Currency PHP (client formats via existing `formatPHP`).
- Summary is viewable by ANY authenticated user (ADMIN, LEASING_OFFICER, VIEWER).
- Tests run against the real `rbu_leasing` DB; `server/vitest.config.js` already sets `fileParallelism:false`. Reuse `tests/helpers.js`.
- Prisma pinned to v6. ESM throughout. Reuse the "Blueprint & Ledger" client design system (global classes; new views styled via existing selectors + minimal scoped CSS). Commit after each green task.

---

## File Structure (this plan)

```
server/
  src/
    lib/dates.js               MODIFY: startOfQuarter/NextQuarter/Year/NextYear
    services/summaryService.js  NEW: periodRange, priorRange, metricsFor, getExecutiveSummary
    controllers/summaryController.js  NEW
    routes/summaryRoutes.js     NEW
    app.js                      MODIFY: mount /api/summary
  tests/
    datesPeriods.test.js        NEW (quarter/year helpers)
    summaryPeriods.test.js      NEW (periodRange/priorRange)
    summaryMetrics.test.js      NEW (metricsFor)
    summaryAggregate.test.js    NEW (getExecutiveSummary + deltas)
    summaryRoutes.test.js       NEW
client/
  src/
    lib/summary.js              NEW: fetchSummary(period, date)
    views/SummaryView.vue       NEW
    components/AppLayout.vue     MODIFY: add "Summary" nav link
    router/index.js             MODIFY: add /summary route
  tests/
    SummaryView.test.js         NEW
```

---

### Task 1: Quarter/year date helpers

**Files:**
- Modify: `server/src/lib/dates.js`
- Create: `server/tests/datesPeriods.test.js`

**Interfaces:**
- Consumes: existing `dates.js`.
- Produces: `startOfQuarter(d)`, `startOfNextQuarter(d)`, `startOfYear(d)`, `startOfNextYear(d)` — each returns a `Date` at the first day of that calendar boundary, handling year rollover.

- [ ] **Step 1: Write the failing test**

`server/tests/datesPeriods.test.js`:

```js
import { describe, it, expect } from "vitest";
import { startOfQuarter, startOfNextQuarter, startOfYear, startOfNextYear } from "../src/lib/dates.js";

describe("quarter/year helpers", () => {
  it("startOfQuarter snaps to the quarter's first month", () => {
    expect(startOfQuarter(new Date(2026, 4, 10))).toEqual(new Date(2026, 3, 1)); // May -> Apr 1
    expect(startOfQuarter(new Date(2026, 11, 31))).toEqual(new Date(2026, 9, 1)); // Dec -> Oct 1
  });
  it("startOfNextQuarter rolls into the next year", () => {
    expect(startOfNextQuarter(new Date(2026, 4, 10))).toEqual(new Date(2026, 6, 1)); // -> Jul 1
    expect(startOfNextQuarter(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1)); // -> Jan 1 2027
  });
  it("startOfYear / startOfNextYear", () => {
    expect(startOfYear(new Date(2026, 5, 15))).toEqual(new Date(2026, 0, 1));
    expect(startOfNextYear(new Date(2026, 5, 15))).toEqual(new Date(2027, 0, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test datesPeriods`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Write the implementation**

Append to `server/src/lib/dates.js`:

```js
export function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

export function startOfNextQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 1);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function startOfNextYear(d) {
  return new Date(d.getFullYear() + 1, 0, 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test datesPeriods`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/dates.js server/tests/datesPeriods.test.js
git commit -m "feat: quarter and year date helpers"
```

---

### Task 2: Period ranges

**Files:**
- Create: `server/src/services/summaryService.js`, `server/tests/summaryPeriods.test.js`

**Interfaces:**
- Consumes: `dates.js` helpers, `addDays`.
- Produces:
  - `periodRange(type, anchor) -> { start, end }` — calendar month/quarter/year containing `anchor`; `end` is exclusive (next period start). Unknown type defaults to month.
  - `priorRange(type, anchor) -> { start, end }` — the period immediately before the one containing `anchor`.

- [ ] **Step 1: Write the failing test**

`server/tests/summaryPeriods.test.js`:

```js
import { describe, it, expect } from "vitest";
import { periodRange, priorRange } from "../src/services/summaryService.js";

describe("periodRange", () => {
  it("month range", () => {
    expect(periodRange("month", new Date(2026, 5, 15))).toEqual({ start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) });
  });
  it("quarter range (Q2)", () => {
    expect(periodRange("quarter", new Date(2026, 4, 10))).toEqual({ start: new Date(2026, 3, 1), end: new Date(2026, 6, 1) });
  });
  it("year range", () => {
    expect(periodRange("year", new Date(2026, 7, 1))).toEqual({ start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) });
  });
  it("unknown type falls back to month", () => {
    expect(periodRange("weird", new Date(2026, 5, 15))).toEqual({ start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) });
  });
});

describe("priorRange", () => {
  it("prior month", () => {
    expect(priorRange("month", new Date(2026, 5, 15))).toEqual({ start: new Date(2026, 4, 1), end: new Date(2026, 5, 1) });
  });
  it("prior quarter (Q2 -> Q1)", () => {
    expect(priorRange("quarter", new Date(2026, 4, 10))).toEqual({ start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) });
  });
  it("prior year", () => {
    expect(priorRange("year", new Date(2026, 7, 1))).toEqual({ start: new Date(2025, 0, 1), end: new Date(2026, 0, 1) });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test summaryPeriods`
Expected: FAIL — cannot import `summaryService.js`.

- [ ] **Step 3: Write the implementation**

`server/src/services/summaryService.js`:

```js
import { prisma } from "../lib/prisma.js";
import {
  startOfMonth, startOfNextMonth,
  startOfQuarter, startOfNextQuarter,
  startOfYear, startOfNextYear,
  addDays,
} from "../lib/dates.js";

function num(value) {
  return value == null ? 0 : Number(value);
}

export function periodRange(type, anchor) {
  if (type === "quarter") return { start: startOfQuarter(anchor), end: startOfNextQuarter(anchor) };
  if (type === "year") return { start: startOfYear(anchor), end: startOfNextYear(anchor) };
  return { start: startOfMonth(anchor), end: startOfNextMonth(anchor) };
}

export function priorRange(type, anchor) {
  const { start } = periodRange(type, anchor);
  const priorAnchor = addDays(start, -1);
  return periodRange(type, priorAnchor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test summaryPeriods`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/summaryService.js server/tests/summaryPeriods.test.js
git commit -m "feat: summary period range helpers"
```

---

### Task 3: Period metrics

**Files:**
- Modify: `server/src/services/summaryService.js`
- Create: `server/tests/summaryMetrics.test.js`

**Interfaces:**
- Consumes: `prisma`, `addDays`, `num`, `periodRange`.
- Produces: `metricsFor(range) -> Promise<{ totalIncome, expected, collected, collectionRate, occupancyRate, newLeases, terminatedLeases }>` for a `{ start, end }` range (end exclusive).

- [ ] **Step 1: Write the failing test**

`server/tests/summaryMetrics.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { metricsFor, periodRange } from "../src/services/summaryService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("metricsFor (June 2026)", () => {
  it("computes income, expected, rates, new and terminated leases", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();

    // active lease covering all of 2026 -> occupancy + income source
    const lease = await factory.lease(u.id, t.id, {
      status: "ACTIVE", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31),
    });
    // a lease that STARTS in June -> new lease
    await factory.lease(u.id, t.id, { status: "ACTIVE", startDate: new Date(2026, 5, 5), endDate: new Date(2026, 11, 31) });
    // a lease TERMINATED in June -> terminated lease
    await factory.lease(u.id, t.id, { status: "TERMINATED", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 5, 20) });

    // payments
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date(2026, 5, 5), paidDate: new Date(2026, 5, 6) }); // expected + collected
    await factory.payment(lease.id, { amount: 10000, dueDate: new Date(2026, 5, 8), paidDate: null });                 // expected only
    await factory.payment(lease.id, { amount: 99999, dueDate: new Date(2026, 4, 5), paidDate: new Date(2026, 4, 6) }); // May -> outside

    const m = await metricsFor(periodRange("month", new Date(2026, 5, 15)));
    expect(m.expected).toBe(35000);
    expect(m.collected).toBe(25000);
    expect(m.totalIncome).toBe(25000);
    expect(m.collectionRate).toBeCloseTo(25000 / 35000);
    expect(m.newLeases).toBe(1);
    expect(m.terminatedLeases).toBe(1);
    expect(m.occupancyRate).toBeCloseTo(1);
  });

  it("returns zeros for an empty period", async () => {
    const m = await metricsFor(periodRange("month", new Date(2026, 5, 15)));
    expect(m).toEqual({
      totalIncome: 0, expected: 0, collected: 0, collectionRate: 0,
      occupancyRate: 0, newLeases: 0, terminatedLeases: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test summaryMetrics`
Expected: FAIL — `metricsFor` not exported.

- [ ] **Step 3: Write the implementation**

Append to `server/src/services/summaryService.js`:

```js
export async function metricsFor(range) {
  const { start, end } = range;
  const atEnd = addDays(end, -1); // last day of the period, for point-in-time occupancy

  const [expectedAgg, collectedAgg, newLeases, terminatedLeases, totalUnits, occupied] =
    await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true }, where: { dueDate: { gte: start, lt: end } } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { paidDate: { gte: start, lt: end } } }),
      prisma.lease.count({ where: { startDate: { gte: start, lt: end } } }),
      prisma.lease.count({ where: { status: "TERMINATED", endDate: { gte: start, lt: end } } }),
      prisma.unit.count(),
      prisma.unit.count({
        where: { leases: { some: { status: "ACTIVE", startDate: { lte: atEnd }, endDate: { gte: atEnd } } } },
      }),
    ]);

  const expected = num(expectedAgg._sum.amount);
  const collected = num(collectedAgg._sum.amount);
  const collectionRate = expected === 0 ? 0 : collected / expected;
  const occupancyRate = totalUnits === 0 ? 0 : occupied / totalUnits;

  return { totalIncome: collected, expected, collected, collectionRate, occupancyRate, newLeases, terminatedLeases };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test summaryMetrics`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/summaryService.js server/tests/summaryMetrics.test.js
git commit -m "feat: summary period metrics (income, collections, occupancy, lease flow)"
```

---

### Task 4: Executive summary aggregate + deltas

**Files:**
- Modify: `server/src/services/summaryService.js`
- Create: `server/tests/summaryAggregate.test.js`

**Interfaces:**
- Consumes: `periodRange`, `priorRange`, `metricsFor`.
- Produces: `getExecutiveSummary({ type = "month", anchor = new Date() }) -> Promise<{ period: { type, start, end, label }, current, prior, deltas }>` where `deltas[key] = { change, pct, direction }` for each metric key; `pct` is `null` when prior is 0.

- [ ] **Step 1: Write the failing test**

`server/tests/summaryAggregate.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getExecutiveSummary } from "../src/services/summaryService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("getExecutiveSummary", () => {
  it("labels the period and returns current, prior, and deltas", async () => {
    const summary = await getExecutiveSummary({ type: "month", anchor: new Date(2026, 5, 15) });
    expect(summary.period.type).toBe("month");
    expect(summary.period.label).toBe("June 2026");
    expect(summary).toHaveProperty("current");
    expect(summary).toHaveProperty("prior");
    expect(summary.deltas.collected).toHaveProperty("direction");
  });

  it("marks a metric that rose vs the prior period as 'up' with null pct when prior is zero", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();
    const lease = await factory.lease(u.id, t.id);
    // collected in June (current), nothing in May (prior)
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date(2026, 5, 5), paidDate: new Date(2026, 5, 6) });

    const summary = await getExecutiveSummary({ type: "month", anchor: new Date(2026, 5, 15) });
    expect(summary.current.collected).toBe(25000);
    expect(summary.prior.collected).toBe(0);
    expect(summary.deltas.collected.direction).toBe("up");
    expect(summary.deltas.collected.change).toBe(25000);
    expect(summary.deltas.collected.pct).toBeNull();
  });

  it("labels quarter and year periods", async () => {
    const q = await getExecutiveSummary({ type: "quarter", anchor: new Date(2026, 4, 10) });
    expect(q.period.label).toBe("Q2 2026");
    const y = await getExecutiveSummary({ type: "year", anchor: new Date(2026, 4, 10) });
    expect(y.period.label).toBe("2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test summaryAggregate`
Expected: FAIL — `getExecutiveSummary` not exported.

- [ ] **Step 3: Write the implementation**

Append to `server/src/services/summaryService.js`:

```js
const METRIC_KEYS = [
  "totalIncome", "expected", "collected", "collectionRate",
  "occupancyRate", "newLeases", "terminatedLeases",
];

function delta(current, prior) {
  const change = current - prior;
  const pct = prior !== 0 ? change / prior : null;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return { change, pct, direction };
}

function periodLabel(type, start) {
  const year = start.getFullYear();
  if (type === "year") return String(year);
  if (type === "quarter") return `Q${Math.floor(start.getMonth() / 3) + 1} ${year}`;
  return `${start.toLocaleString("en-US", { month: "long" })} ${year}`;
}

export async function getExecutiveSummary({ type = "month", anchor = new Date() } = {}) {
  const cur = periodRange(type, anchor);
  const prev = priorRange(type, anchor);
  const [current, prior] = await Promise.all([metricsFor(cur), metricsFor(prev)]);
  const deltas = {};
  for (const key of METRIC_KEYS) deltas[key] = delta(current[key], prior[key]);
  return {
    period: { type, start: cur.start, end: cur.end, label: periodLabel(type, cur.start) },
    current,
    prior,
    deltas,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test summaryAggregate`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/summaryService.js server/tests/summaryAggregate.test.js
git commit -m "feat: executive summary aggregate with period-over-period deltas"
```

---

### Task 5: Summary API route

**Files:**
- Create: `server/src/controllers/summaryController.js`, `server/src/routes/summaryRoutes.js`, `server/tests/summaryRoutes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `getExecutiveSummary`, `verifyJwt`, `zod`.
- Produces: `GET /api/summary?period=month|quarter|year&date=<ISO>` (any authenticated role); defaults to the current month; invalid `period` → 400.

- [ ] **Step 1: Write the failing test**

`server/tests/summaryRoutes.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/summary", () => {
  it("returns the summary for a viewer, anchored by the date param", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();
    const lease = await factory.lease(u.id, t.id);
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date(2026, 5, 5), paidDate: new Date(2026, 5, 6) });

    const res = await request(app).get("/api/summary?period=month&date=2026-06-15")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body.period.type).toBe("month");
    expect(res.body.current.collected).toBe(25000);
    expect(res.body).toHaveProperty("prior");
    expect(res.body.deltas.collected.direction).toBe("up");
  });

  it("rejects an invalid period with 400", async () => {
    const res = await request(app).get("/api/summary?period=decade")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/summary");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test summaryRoutes`
Expected: FAIL — route not mounted / modules not found.

- [ ] **Step 3: Write the implementation**

`server/src/controllers/summaryController.js`:

```js
import { z } from "zod";
import { getExecutiveSummary } from "../services/summaryService.js";

const querySchema = z.object({
  period: z.enum(["month", "quarter", "year"]).optional(),
  date: z.coerce.date().optional(),
});

export async function get(req, res, next) {
  try {
    const { period, date } = querySchema.parse(req.query);
    const summary = await getExecutiveSummary({ type: period || "month", anchor: date || new Date() });
    res.json(summary);
  } catch (e) { next(e); }
}
```

`server/src/routes/summaryRoutes.js`:

```js
import { Router } from "express";
import { get } from "../controllers/summaryController.js";
import { verifyJwt } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", get);
export default router;
```

`server/src/app.js` — add the import alongside the other route imports:

```js
import summaryRoutes from "./routes/summaryRoutes.js";
```

And mount it after the dashboard line:

```js
  app.use("/api/summary", summaryRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test summaryRoutes`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full server suite**

Run: `npm --workspace server test`
Expected: PASS — Plan 1–4 (60) + datesPeriods (3) + summaryPeriods (7) + summaryMetrics (2) + summaryAggregate (3) + summaryRoutes (3) = 78.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/summaryController.js server/src/routes/summaryRoutes.js server/src/app.js server/tests/summaryRoutes.test.js
git commit -m "feat: executive summary API route (GET /api/summary)"
```

---

### Task 6: Vue Executive Summary view

**Files:**
- Create: `client/src/lib/summary.js`, `client/src/views/SummaryView.vue`, `client/tests/SummaryView.test.js`
- Modify: `client/src/components/AppLayout.vue`, `client/src/router/index.js`

**Interfaces:**
- Consumes: `api`, `formatPHP`.
- Produces: `fetchSummary(period, date) -> Promise<summary>`; a `SummaryView` with a Month/Quarter/Year selector and a this-vs-prior comparison table; a `/summary` route and a "Summary" nav link.

- [ ] **Step 1: Write the failing test**

`client/tests/SummaryView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const sample = {
  period: { type: "month", label: "June 2026", start: "", end: "" },
  current: { totalIncome: 25000, expected: 35000, collected: 25000, collectionRate: 0.714, occupancyRate: 1, newLeases: 1, terminatedLeases: 0 },
  prior: { totalIncome: 0, expected: 0, collected: 0, collectionRate: 0, occupancyRate: 0.8, newLeases: 0, terminatedLeases: 0 },
  deltas: {
    totalIncome: { change: 25000, pct: null, direction: "up" },
    expected: { change: 35000, pct: null, direction: "up" },
    collected: { change: 25000, pct: null, direction: "up" },
    collectionRate: { change: 0.714, pct: null, direction: "up" },
    occupancyRate: { change: 0.2, pct: 0.25, direction: "up" },
    newLeases: { change: 1, pct: null, direction: "up" },
    terminatedLeases: { change: 0, pct: 0, direction: "flat" },
  },
};

vi.mock("../src/lib/summary.js", () => ({
  fetchSummary: vi.fn(() => Promise.resolve(sample)),
}));

import SummaryView from "../src/views/SummaryView.vue";
import { fetchSummary } from "../src/lib/summary.js";

describe("SummaryView", () => {
  beforeEach(() => { fetchSummary.mockClear(); });

  it("renders the period label and current values", async () => {
    const w = mount(SummaryView);
    await flushPromises();
    const text = w.text();
    expect(text).toContain("June 2026");
    expect(text).toContain("25,000");   // collected (PHP)
    expect(text).toContain("▲");        // an up delta indicator
  });

  it("reloads with the chosen period when a selector button is clicked", async () => {
    const w = mount(SummaryView);
    await flushPromises();
    const quarter = w.findAll("button").find((b) => b.text() === "Quarter");
    await quarter.trigger("click");
    await flushPromises();
    expect(fetchSummary).toHaveBeenCalledWith("quarter");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test SummaryView`
Expected: FAIL — `../src/lib/summary.js` / `SummaryView.vue` not found.

- [ ] **Step 3: Write the implementation**

`client/src/lib/summary.js`:

```js
import { api } from "./api.js";

export function fetchSummary(period, date) {
  return api.get("/summary", { params: { period, date } }).then((r) => r.data);
}
```

`client/src/views/SummaryView.vue`:

```vue
<script setup>
import { ref, onMounted } from "vue";
import { fetchSummary } from "../lib/summary.js";
import { formatPHP } from "../lib/formatters.js";

const period = ref("month");
const data = ref(null);
const periods = [
  { v: "month", label: "Month" },
  { v: "quarter", label: "Quarter" },
  { v: "year", label: "Year" },
];

async function load() { data.value = await fetchSummary(period.value); }
onMounted(load);

function setPeriod(v) {
  if (period.value === v) return;
  period.value = v;
  load();
}

function pctFmt(r) { return `${Math.round(r * 100)}%`; }
function arrow(d) { return d === "up" ? "▲" : d === "down" ? "▼" : "–"; }

const rows = [
  { key: "totalIncome", label: "Income (collected)", type: "money" },
  { key: "expected", label: "Expected", type: "money" },
  { key: "collectionRate", label: "Collection rate", type: "rate" },
  { key: "occupancyRate", label: "Occupancy", type: "rate" },
  { key: "newLeases", label: "New leases", type: "count" },
  { key: "terminatedLeases", label: "Terminated leases", type: "count" },
];

function fmt(value, type) {
  if (type === "money") return formatPHP(value);
  if (type === "rate") return pctFmt(value);
  return value;
}

function deltaText(row) {
  const d = data.value.deltas[row.key];
  if (row.type === "rate") return `${arrow(d.direction)} ${Math.round(d.change * 100)} pp`;
  return `${arrow(d.direction)} ${fmt(Math.abs(d.change), row.type)}`;
}
</script>

<template>
  <section class="summary">
    <header>
      <h1>Executive Summary</h1>
      <div class="seg">
        <button
          v-for="p in periods"
          :key="p.v"
          type="button"
          :class="{ active: period === p.v }"
          @click="setPeriod(p.v)"
        >
          {{ p.label }}
        </button>
      </div>
    </header>

    <div v-if="data">
      <p class="period-label">{{ data.period.label }} <span>vs prior {{ period }}</span></p>
      <table>
        <thead>
          <tr><th>Metric</th><th>This period</th><th>Prior</th><th>Change</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <td>{{ row.label }}</td>
            <td>{{ fmt(data.current[row.key], row.type) }}</td>
            <td>{{ fmt(data.prior[row.key], row.type) }}</td>
            <td :class="`delta delta--${data.deltas[row.key].direction}`">{{ deltaText(row) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else>Loading…</p>
  </section>
</template>

<style scoped>
.seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.seg button {
  background: var(--surface);
  color: var(--muted);
  border: none;
  border-radius: 0;
  padding: 0.5rem 1rem;
  box-shadow: none;
}
.seg button + button { border-left: 1px solid var(--line); }
.seg button.active { background: var(--accent); color: #fff; }
.period-label {
  color: var(--muted);
  margin: 0 0 1rem;
  font-size: 0.95rem;
}
.period-label span { color: var(--faint); }
.delta--up { color: var(--good); font-variant-numeric: tabular-nums; }
.delta--down { color: var(--danger); font-variant-numeric: tabular-nums; }
.delta--flat { color: var(--faint); }
</style>
```

`client/src/components/AppLayout.vue` — add a "Summary" link to the `links` array, right after Dashboard:

```js
const links = [
  { to: "/", label: "Dashboard" },
  { to: "/summary", label: "Summary" },
  { to: "/owners", label: "Owners" },
  { to: "/units", label: "Units" },
  { to: "/tenants", label: "Tenants" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];
```

`client/src/router/index.js` — add the import with the other view imports:

```js
import SummaryView from "../views/SummaryView.vue";
```

And add the child route after the dashboard (`path: ""`) child:

```js
      { path: "summary", component: SummaryView },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test SummaryView`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full client suite**

Run: `npm --workspace client test`
Expected: PASS — Plan 3–4 (38) + SummaryView (2) = 40.

- [ ] **Step 6: Browser verification**

```bash
npm run dev:server
npm run dev:client
```

Log in as `admin@rbu.local` / `admin123`; click **Summary** in the sidebar. Confirm the period label renders, the Month/Quarter/Year selector switches the data, and the comparison table shows This period / Prior / Change with colored up/down indicators. Navigate via in-app nav (token is in-memory).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/summary.js client/src/views/SummaryView.vue client/src/components/AppLayout.vue client/src/router/index.js client/tests/SummaryView.test.js
git commit -m "feat(client): executive summary view with period selector and deltas"
```

---

## Self-Review

**Spec coverage (Executive Summary section):** Period selection month/quarter/year (Task 6 selector; Task 2 ranges) ✓. Selected vs immediately prior period (Task 2 `priorRange`, Task 4 aggregate) ✓. Total income (Task 3 `totalIncome`=collected) ✓, collections expected vs collected (Task 3) ✓, occupancy rate (Task 3, point-in-time at period end) ✓, new leases (Task 3) ✓, terminated leases (Task 3, `status=TERMINATED` + `endDate` in period) ✓, delta indicators (Task 4 `deltas`; Task 6 arrows/colors) ✓. All math in `summaryService` (single source of truth) ✓. Viewable by all roles — `verifyJwt` only (Task 5) ✓.

**Placeholder scan:** No TBD/TODO. Every code step is complete. Task 5 modifies `app.js` with the exact import + mount lines. Task 6 gives the exact `links` array and router edits.

**Type consistency:** `getExecutiveSummary` returns `{ period:{type,start,end,label}, current, prior, deltas }`; the controller passes it through; `SummaryView` reads `data.period.label`, `data.current[key]`, `data.prior[key]`, `data.deltas[key].{change,direction}`. Metric keys match across `metricsFor`, `METRIC_KEYS`, and the view's `rows`. `fetchSummary(period)` called with the period string; controller reads `period`/`date` query params. `factory.lease`/`factory.payment` overrides used (`status`, `startDate`, `endDate`, `dueDate`, `paidDate`, `amount`) all exist in `tests/helpers.js`.

**Test count:** server: datesPeriods 3 + summaryPeriods 7 + summaryMetrics 2 + summaryAggregate 3 + summaryRoutes 3 = 18 new → **78 total** (was 60). client: SummaryView 2 → **40 total** (was 38).

## Later Plans (preview)

- **Plan 6 — Excel reports:** rent roll, collections, lease expiry, owner statement via ExcelJS (reuse dashboard/summary service functions).
- **Plan 7 — Hardening:** token persistence, pagination, FK labels in list views, self-hosted fonts, optional `terminatedAt` field for precise termination reporting.
