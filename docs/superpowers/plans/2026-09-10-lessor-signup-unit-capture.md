# Lessor Signup Unit Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lessor who clicks "List your unit" describes their unit during signup; the unit is held with the application and materialises as a DRAFT unit when staff approve the account.

**Architecture:** A unit cannot exist before approval — `Unit.ownerId` is required and the `UnitOwner` row is deliberately created only on approval. So signup stores a whitelisted `pendingUnit` JSONB blob on `User`, and `approveAccount` creates the `UnitOwner` and the `Unit` together in its existing transaction. Two new read-only public endpoints let the signed-out signup page populate its estate and tower dropdowns.

**Tech Stack:** Express 5, Prisma 6.19.3 + PostgreSQL 17, Zod validation, Vitest + supertest (server); Vue 3 `<script setup>`, Vitest + @vue/test-utils + happy-dom (client).

**Spec:** `docs/superpowers/specs/2026-09-10-lessor-signup-unit-capture-design.md`

## Global Constraints

- Server commands run from `server/`, client commands from `client/`. Test: `npm test`. Single file: `npx vitest run tests/<file> --reporter=verbose`.
- **Never `git add -A`, `git add .`, or `git add <directory>`.** Stage only the exact files each step names. The working tree holds unrelated untracked files (`docs/role-playbook.html`, `docs/RBU-Leasing-Walkthrough.docx`, `server/.gitignore`) that must never be committed.
- **Never run `prisma migrate`.** The committed Prisma history has drifted from the deployed databases. Schema changes are additive, idempotent SQL in `server/prisma/manual-migrations/`, applied by hand.
- **The `rbuleasing.exe` Windows service locks the generated Prisma client.** If `npx prisma generate` fails with `EPERM`, stop and report BLOCKED — stopping that service needs UAC elevation, which the controller will handle before re-dispatching.
- Migrations must be applied to **both** `rbu_leasing` (dev, from `server/.env`) and `rbu_leasing_test` (from `server/.env.test`), or the server tests fail against a database without the column.
- Never print a database password into output. Read connection strings from the env files, never echo them.
- The whitelisted `pendingUnit` field set is exactly: `estateId`, `towerId`, `unitNumber`, `floor`, `slotNo`, `type`, `baseRent`. `unitNumber` is the only required one.
- The public reference endpoints return **only** `id` and `name`. No counts, no rent, no ownership.
- No literal hex colors in client CSS — the theme has a light and a dark path. Use the existing CSS custom properties.

---

### Task 1: Public estate and tower lookup

**Files:**
- Create: `server/src/controllers/publicReferenceController.js`
- Create: `server/src/routes/publicReferenceRoutes.js`
- Modify: `server/src/app.js`
- Test: `server/tests/publicReference.test.js` (create)

**Interfaces:**
- Consumes: `listEstates()` and `listTowers({ estateId })` from `server/src/services/estateService.js` and `towerService.js`.
- Produces: `GET /api/public/estates` → `[{ id, name }]`; `GET /api/public/towers?estateId=<id>` → `[{ id, name }]`, `400` without `estateId`. Task 4 consumes both.

- [ ] **Step 1: Write the failing test**

Create `server/tests/publicReference.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { factory, resetCrudTables } from "./helpers.js";

// The signup page is signed out, so it cannot use /api/estates or /api/towers —
// both sit behind verifyJwt. These endpoints exist so a lessor can pick their
// estate and tower while applying. They expose names only: the same information
// the published listings already carry.
//
// Every test creates its own reference data. `resetCrudTables` deletes estates
// and towers, so asserting against whatever happens to be in the database would
// pass or fail depending on which test file ran last.
const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/public/estates", () => {
  it("lists estates with no token, exposing only id and name", async () => {
    const estate = await factory.estate({ name: "Capitol Commons" });
    const res = await request(app).get("/api/public/estates");
    expect(res.status).toBe(200);
    const row = res.body.find((e) => e.id === estate.id);
    expect(row).toBeDefined();
    expect(row.name).toBe("Capitol Commons");
    expect(Object.keys(row).sort()).toEqual(["id", "name"]);
  });
});

describe("GET /api/public/towers", () => {
  it("lists only the named estate's towers, with no token", async () => {
    const estate = await factory.estate({ name: "Capitol Commons" });
    await factory.tower(estate.id, { name: "Empress" });
    const other = await factory.estate({ name: "Circulo Verde" });
    await factory.tower(other.id, { name: "Elsewhere" });

    const res = await request(app).get("/api/public/towers").query({ estateId: estate.id });
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.name)).toEqual(["Empress"]);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  // Without a scope this would dump every tower in the portfolio.
  it("refuses to list towers without an estateId", async () => {
    const res = await request(app).get("/api/public/towers");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/publicReference.test.js --reporter=verbose`
Expected: FAIL — all four tests get 404, because the routes do not exist.

- [ ] **Step 3: Write the controller**

Create `server/src/controllers/publicReferenceController.js`:

```js
// Read-only reference data for the signed-out signup page. Deliberately narrow:
// id and name only, so this endpoint can never become a portfolio dump. The
// authenticated /api/estates and /api/towers are unchanged and still carry the
// full records for staff.
import { listEstates } from "../services/estateService.js";
import { listTowers } from "../services/towerService.js";

const nameOnly = (rows) => rows.map(({ id, name }) => ({ id, name }));

export async function estates(req, res, next) {
  try { res.json(nameOnly(await listEstates())); } catch (e) { next(e); }
}

export async function towers(req, res, next) {
  try {
    const { estateId } = req.query;
    // Scope is required: without it this lists every tower in the portfolio.
    if (!estateId) return res.status(400).json({ error: "estateId is required" });
    res.json(nameOnly(await listTowers({ estateId })));
  } catch (e) { next(e); }
}
```

- [ ] **Step 4: Write the routes**

Create `server/src/routes/publicReferenceRoutes.js`. Two named routers from one file, following the pattern `pageFormRoutes.js` already uses:

```js
import { Router } from "express";
import * as ctrl from "../controllers/publicReferenceController.js";

export const publicEstateRouter = Router();
publicEstateRouter.get("/", ctrl.estates);

export const publicTowerRouter = Router();
publicTowerRouter.get("/", ctrl.towers);
```

- [ ] **Step 5: Mount them**

In `server/src/app.js`, add the import beside the other route imports:

```js
import { publicEstateRouter, publicTowerRouter } from "./routes/publicReferenceRoutes.js";
```

and mount both directly after the existing `app.use("/api/public/units", publicUnitRoutes);` line:

```js
  app.use("/api/public/estates", publicEstateRouter);
  app.use("/api/public/towers", publicTowerRouter);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/publicReference.test.js --reporter=verbose`
Expected: PASS, 4 tests.

- [ ] **Step 7: Run the full server suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/publicReferenceController.js server/src/routes/publicReferenceRoutes.js server/src/app.js server/tests/publicReference.test.js
git commit -m "feat(public): read-only estate and tower lookup for signup

The signup page is signed out and cannot reach /api/estates or
/api/towers. These return names only — the same information the
published listings already expose."
```

---

### Task 2: Signup captures the pending unit

**Files:**
- Create: `server/prisma/manual-migrations/2026-09-10-user-pending-unit.sql`
- Modify: `server/prisma/schema.prisma` (the `User` model)
- Modify: `server/src/validation/user.js:14-23`
- Modify: `server/src/services/authService.js` (`signupPortalUser`, `PENDING_SELECT`)
- Test: `server/tests/authSignup.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `User.pendingUnit` — a nullable JSONB column holding `{ estateId, towerId, unitNumber, floor, slotNo, type, baseRent }`, all strings except `baseRent` (number or null). `signupPortalUser` accepts an optional `unit` property. `PENDING_SELECT` includes `pendingUnit`. Task 3 materialises it; Task 5 renders it.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/authSignup.test.js`, inside the existing `describe("POST /api/auth/signup — public self-registration")` block. Note the file's `cleanup()` already deletes both emails in `EMAILS`, so these need no new teardown.

Add `factory` to this file's imports — it creates its own estate and tower rather than reading whatever is in the database, because `resetCrudTables` in other test files deletes them:

```js
import { factory } from "./helpers.js";
```

```js
  // A lessor who clicked "List your unit" describes it while applying. It cannot
  // be a Unit row yet — Unit.ownerId is required and no UnitOwner exists until
  // approval — so it rides along on the application.
  it("stores a lessor's unit with the application", async () => {
    const estate = await factory.estate();
    const tower = await factory.tower(estate.id);
    const res = await request(app).post("/api/auth/signup").send({
      ...base, name: "New Lessor", email: "lessor.signup@x.com", contactEmail: "lessor.signup@x.com",
      role: "UNIT_OWNER",
      unit: { estateId: estate.id, towerId: tower.id, unitNumber: "19A", floor: "19", type: "1 Bedroom", baseRent: 25000 },
    });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "lessor.signup@x.com" } });
    expect(user.pendingUnit).toMatchObject({ unitNumber: "19A", floor: "19", type: "1 Bedroom", baseRent: 25000 });
    expect(user.pendingUnit.towerId).toBe(tower.id);
    // Still an application: no owner, no unit.
    expect(await prisma.unitOwner.findFirst({ where: { email: "lessor.signup@x.com" } })).toBeNull();
  });

  it("drops fields outside the whitelist rather than storing them", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...base, name: "New Lessor", email: "lessor.signup@x.com", contactEmail: "lessor.signup@x.com",
      role: "UNIT_OWNER",
      unit: { unitNumber: "19A", approvalStatus: "APPROVED", ownerId: "sneaky", status: "LEASED" },
    });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "lessor.signup@x.com" } });
    expect(Object.keys(user.pendingUnit).sort()).toEqual(["unitNumber"]);
  });

  it("refuses a unit with no unit number", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...base, name: "New Lessor", email: "lessor.signup@x.com", contactEmail: "lessor.signup@x.com",
      role: "UNIT_OWNER", unit: { floor: "19" },
    });
    expect(res.status).toBe(400);
  });

  it("refuses a unit whose estate or tower does not exist", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...base, name: "New Lessor", email: "lessor.signup@x.com", contactEmail: "lessor.signup@x.com",
      role: "UNIT_OWNER", unit: { unitNumber: "19A", towerId: "does-not-exist" },
    });
    expect(res.status).toBe(400);
  });

  it("leaves pendingUnit null when the lessor skips the step", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...base, name: "New Lessor", email: "lessor.signup@x.com", contactEmail: "lessor.signup@x.com",
      role: "UNIT_OWNER",
    });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "lessor.signup@x.com" } });
    expect(user.pendingUnit).toBeNull();
  });

  it("never stores a unit for a tenant application", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...base, name: "New Lessee", email: "lessee.signup@x.com", contactEmail: "lessee.signup@x.com",
      role: "TENANT", unit: { unitNumber: "19A" },
    });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "lessee.signup@x.com" } });
    expect(user.pendingUnit).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/authSignup.test.js --reporter=verbose`
Expected: FAIL — `pendingUnit` is not a column, so Prisma throws on the `findUnique` result access, and the `unit` property is stripped by `signupSchema.parse`.

- [ ] **Step 3: Write the migration**

Create `server/prisma/manual-migrations/2026-09-10-user-pending-unit.sql`:

```sql
-- The unit a lessor describes while applying. It cannot be a Unit row yet:
-- Unit.ownerId is required and the UnitOwner is created only on approval, so
-- that the Owners list holds vetted parties only. approveAccount materialises
-- this into a DRAFT Unit inside the same transaction that creates the owner.
--
-- Additive and idempotent, in line with the other manual migrations here — the
-- committed Prisma history has drifted on the deployed databases.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingUnit" JSONB;
```

- [ ] **Step 4: Apply it to both databases**

From `server/`:

```bash
PSQL="/c/Program Files/PostgreSQL/17/bin/psql.exe"
for F in .env .env.test; do
  URL=$(grep -m1 '^DATABASE_URL=' "$F" | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
  "$PSQL" "$URL" -v ON_ERROR_STOP=1 -f prisma/manual-migrations/2026-09-10-user-pending-unit.sql
done
```

Expected: `ALTER TABLE` printed twice. The command must not echo the URL — it holds the password.

- [ ] **Step 5: Add the column to the Prisma schema**

In `server/prisma/schema.prisma`, inside `model User`, add directly after the `rejectionReason` line:

```prisma
  // The unit a lessor described while applying, held until approval — see
  // manual-migrations/2026-09-10-user-pending-unit.sql. Whitelisted keys only:
  // estateId, towerId, unitNumber, floor, slotNo, type, baseRent.
  pendingUnit  Json?
```

Then regenerate the client:

```bash
npx prisma generate
```

Expected: "Generated Prisma Client". If this fails with `EPERM`, stop and report BLOCKED — the running `rbuleasing.exe` service holds the files and stopping it needs UAC elevation.

- [ ] **Step 6: Accept the unit on the signup schema**

In `server/src/validation/user.js`, add above `signupSchema`:

```js
// The unit a lessor may describe while applying. Whitelisted explicitly: this
// arrives from an unauthenticated endpoint, so anything not named here — an
// ownerId, an approvalStatus — must never reach the database.
export const pendingUnitSchema = z.object({
  estateId: z.string().min(1).optional(),
  towerId: z.string().min(1).optional(),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.string().optional(),
  slotNo: z.string().optional(),
  type: z.string().optional(),
  baseRent: z.coerce.number().min(0).optional(),
}).strip();
```

and add one line inside `signupSchema`, after `consent`:

```js
  unit: pendingUnitSchema.optional(),
```

- [ ] **Step 7: Store it at signup**

In `server/src/services/authService.js`, change the `signupPortalUser` signature to accept the unit:

```js
export async function signupPortalUser({ name, email, contactEmail, password, role, unit }) {
```

Then, directly after the existing duplicate-email check (`if (existing) throw new ConflictError(...)`), add:

```js
  // Only a lessor can bring a unit; a tenant application never carries one.
  let pendingUnit = null;
  if (unit && role === "UNIT_OWNER") {
    // Validate the references now rather than at approval: an applicant who
    // picked a real estate and tower should not be told at approval time that
    // their application is unusable.
    if (unit.estateId && !(await prisma.estate.findUnique({ where: { id: unit.estateId } }))) {
      throw new InvalidReferenceError("estate not found");
    }
    if (unit.towerId && !(await prisma.tower.findUnique({ where: { id: unit.towerId } }))) {
      throw new InvalidReferenceError("tower not found");
    }
    pendingUnit = unit;
  }
```

and add `pendingUnit` to the `data` object of the `prisma.user.create` call, after `status: "PENDING",`:

```js
      pendingUnit,
```

`InvalidReferenceError` is already imported in this file — it is thrown by the role check at the top of the same function.

- [ ] **Step 8: Show it to the approver**

In the same file, add `pendingUnit` to `PENDING_SELECT` (currently line 142) so the officer's queue can render it. This is an explicit `select`: a new column is invisible until it is named here.

```js
const PENDING_SELECT = {
  id: true, name: true, email: true, contactEmail: true, role: true, createdAt: true,
  pendingUnit: true,
};
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/authSignup.test.js --reporter=verbose`
Expected: PASS — the file's pre-existing tests plus the 6 new ones.

- [ ] **Step 10: Run the full server suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add server/prisma/manual-migrations/2026-09-10-user-pending-unit.sql server/prisma/schema.prisma server/src/validation/user.js server/src/services/authService.js server/tests/authSignup.test.js
git commit -m "feat(signup): hold a lessor's unit with their application

Whitelisted keys only — this arrives unauthenticated, so an ownerId or
approvalStatus must never reach the database. Estate and tower are
checked at signup so an applicant is not told at approval time that
their application is unusable."
```

---

### Task 3: Approval materialises the unit

**Files:**
- Modify: `server/src/services/authService.js` (`approveAccount`, currently line 168)
- Test: `server/tests/accountApproval.test.js`

**Interfaces:**
- Consumes: `User.pendingUnit` from Task 2.
- Produces: on approving a `UNIT_OWNER` with a `pendingUnit`, a `Unit` row with `approvalStatus: "DRAFT"`, `ownerId` set to the newly created `UnitOwner`, and `pendingUnit` cleared to `null`.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/accountApproval.test.js`, inside its top-level `describe`. Read the file's existing helpers first and reuse them — it already has a way to create a PENDING user and an approver token; do not introduce a second one.

```js
  // Approval is where a vetted party enters the business records, so it is also
  // where the unit they described becomes real — in the same transaction, so a
  // half-approved lessor with no unit cannot exist.
  it("creates the owner and the unit together and clears the pending unit", async () => {
    const estate = await factory.estate();
    const tower = await factory.tower(estate.id);
    const user = await prisma.user.create({
      data: {
        name: "Pending Lessor", email: "pending.lessor@x.com", contactEmail: "pending.lessor@x.com",
        role: "UNIT_OWNER", status: "PENDING", passwordHash: "x", passwordPlain: "x",
        pendingUnit: { estateId: estate.id, towerId: tower.id, unitNumber: "19A", floor: "19", type: "1 Bedroom", baseRent: 25000 },
      },
    });

    const res = await request(app).patch(`/api/auth/pending/${user.id}/approve`).set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.pendingUnit).toBeNull();
    expect(after.unitOwnerId).toBeTruthy();

    const unit = await prisma.unit.findFirst({ where: { ownerId: after.unitOwnerId } });
    expect(unit.unitNumber).toBe("19A");
    expect(unit.towerId).toBe(tower.id);
    expect(Number(unit.baseRent)).toBe(25000);
    // DRAFT, never APPROVED: the schema default is APPROVED, which would skip
    // review entirely. The lessor completes it and submits it themselves.
    expect(unit.approvalStatus).toBe("DRAFT");
  });

  it("defaults a skipped rent to zero, since baseRent is required on Unit", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Pending Lessor", email: "pending.lessor@x.com", contactEmail: "pending.lessor@x.com",
        role: "UNIT_OWNER", status: "PENDING", passwordHash: "x", passwordPlain: "x",
        pendingUnit: { unitNumber: "19A" },
      },
    });
    await request(app).patch(`/api/auth/pending/${user.id}/approve`).set("Authorization", `Bearer ${tokens.admin()}`);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    const unit = await prisma.unit.findFirst({ where: { ownerId: after.unitOwnerId } });
    expect(Number(unit.baseRent)).toBe(0);
  });

  // Reference data changing must never make an applicant unapprovable.
  it("still approves when the recorded tower has since been deleted", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Pending Lessor", email: "pending.lessor@x.com", contactEmail: "pending.lessor@x.com",
        role: "UNIT_OWNER", status: "PENDING", passwordHash: "x", passwordPlain: "x",
        pendingUnit: { unitNumber: "19A", towerId: "deleted-tower-id" },
      },
    });
    const res = await request(app).patch(`/api/auth/pending/${user.id}/approve`).set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    const unit = await prisma.unit.findFirst({ where: { ownerId: after.unitOwnerId } });
    expect(unit.unitNumber).toBe("19A");
    expect(unit.towerId).toBeNull();
  });

  it("creates no unit when the applicant skipped the step", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Pending Lessor", email: "pending.lessor@x.com", contactEmail: "pending.lessor@x.com",
        role: "UNIT_OWNER", status: "PENDING", passwordHash: "x", passwordPlain: "x",
      },
    });
    await request(app).patch(`/api/auth/pending/${user.id}/approve`).set("Authorization", `Bearer ${tokens.admin()}`);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.unitOwnerId).toBeTruthy();
    expect(await prisma.unit.count({ where: { ownerId: after.unitOwnerId } })).toBe(0);
  });

  it("creates no unit when the application is rejected", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Pending Lessor", email: "pending.lessor@x.com", contactEmail: "pending.lessor@x.com",
        role: "UNIT_OWNER", status: "PENDING", passwordHash: "x", passwordPlain: "x",
        pendingUnit: { unitNumber: "19A" },
      },
    });
    const before = await prisma.unit.count();
    await request(app).patch(`/api/auth/pending/${user.id}/reject`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ reason: "not verified" });
    expect(await prisma.unit.count()).toBe(before);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
```

This file already runs `beforeEach(async () => { await resetCrudTables(); })`, which clears users, units, owners, towers and estates in FK-safe order — so these tests need **no** teardown of their own. Add `factory` to the file's existing `./helpers.js` import (it already imports `resetCrudTables` and `tokens` from there); create estates and towers through `factory` rather than reading the database, since `resetCrudTables` deletes them.

The approve and reject paths used above (`/api/auth/pending/:id/approve` and `.../reject`) are the ones this file's existing tests already use.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/accountApproval.test.js --reporter=verbose`
Expected: FAIL — approval creates the owner but no unit, so `prisma.unit.findFirst` returns null.

- [ ] **Step 3: Materialise the unit inside the existing transaction**

In `server/src/services/authService.js`, inside `approveAccount`'s `prisma.$transaction` callback, replace the `UNIT_OWNER` branch:

```js
      if (user.role === "UNIT_OWNER") {
        const owner = await tx.unitOwner.create({ data: { name: user.name, email: user.contactEmail } });
        data.unitOwnerId = owner.id;
      } else if (user.role === "TENANT") {
```

with:

```js
      if (user.role === "UNIT_OWNER") {
        const owner = await tx.unitOwner.create({ data: { name: user.name, email: user.contactEmail } });
        data.unitOwnerId = owner.id;
        if (user.pendingUnit) {
          await tx.unit.create({ data: await buildPendingUnit(tx, owner.id, user.pendingUnit) });
          data.pendingUnit = null; // consumed
        }
      } else if (user.role === "TENANT") {
```

and add this helper directly above `approveAccount`:

```js
// The unit a lessor described at signup, turned into a real row now that they
// have an owner record to hang it on.
//
// DRAFT is set explicitly: the schema default is APPROVED, which would put a
// self-registered unit straight into the portfolio without review. The lessor
// completes anything they skipped from My Units and submits it themselves.
//
// A tower deleted between signup and approval is dropped rather than fatal —
// reference data changing must never leave an applicant unapprovable.
async function buildPendingUnit(tx, ownerId, pending) {
  const towerId = pending.towerId && (await tx.tower.findUnique({ where: { id: pending.towerId } }))
    ? pending.towerId
    : null;
  return {
    ownerId,
    unitNumber: pending.unitNumber,
    towerId,
    floor: pending.floor || null,
    slotNo: pending.slotNo || null,
    // Unit.type has a default; only override it when the lessor named one.
    ...(pending.type ? { type: pending.type } : {}),
    // baseRent is a required Decimal while the signup field is optional.
    baseRent: pending.baseRent ?? 0,
    approvalStatus: "DRAFT",
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/accountApproval.test.js --reporter=verbose`
Expected: PASS — the file's pre-existing tests plus the 5 new ones.

- [ ] **Step 5: Run the full server suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/authService.js server/tests/accountApproval.test.js
git commit -m "feat(approval): materialise a lessor's pending unit as a DRAFT

Created in the same transaction as the UnitOwner, so a half-approved
lessor with no unit cannot exist. DRAFT is explicit — the schema default
is APPROVED, which would skip review entirely."
```

---

### Task 4: Signup asks a lessor for their unit

**Files:**
- Modify: `client/src/lib/resource.js`
- Modify: `client/src/views/SignupView.vue`
- Test: `client/tests/SignupView.test.js`

**Interfaces:**
- Consumes: `GET /api/public/estates` and `GET /api/public/towers?estateId=` from Task 1; the `unit` property on `POST /api/auth/signup` from Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

Add to `client/tests/SignupView.test.js`, inside its existing `describe("SignupView")` block. The file already provides everything these tests need — use them, and do not add a second mounting helper or a second mock of `../src/lib/api.js`:

- `mountSignupAs(as)` — mounts at `/signup?as=<as>`
- `fillValid(w, over = {})` — fills name, username, contactEmail, password, confirm and ticks consent
- `submit(w)` — `w.find("form").trigger("submit.prevent")`
- `api.post` is mocked and cleared in the file's `beforeEach`

**The file's `api` mock provides `post` only.** `SignupView` will now import `publicRefs` from `../src/lib/resource.js`, whose functions call `api.get` — which would be `undefined` and throw. Mocking the resource module keeps `api.get` out of the picture entirely. Add this beside the existing `vi.mock` at the top of the file:

```js
vi.mock("../src/lib/resource.js", () => ({
  publicRefs: {
    estates: vi.fn(() => Promise.resolve([{ id: "e1", name: "Capitol Commons" }])),
    towers: vi.fn(() => Promise.resolve([{ id: "t1", name: "Empress" }])),
  },
}));
```

Then add these tests:

```js
  // The landing card promises "List your unit", so a lessor is asked for one.
  it("shows the unit step to a lessor after the account details", async () => {
    const w = await mountSignupAs("LESSOR");
    await fillValid(w);
    await submit(w);
    await flushPromises();
    expect(w.find("#unitNumber").exists()).toBe(true);
    expect(api.post).not.toHaveBeenCalled(); // advanced a step, not submitted
  });

  it("never shows the unit step to a tenant", async () => {
    const w = await mountSignupAs("LESSEE");
    await fillValid(w);
    await submit(w);
    await flushPromises();
    expect(w.find("#unitNumber").exists()).toBe(false);
    expect(api.post).toHaveBeenCalledWith("/auth/signup", expect.not.objectContaining({ unit: expect.anything() }));
  });

  it("sends the unit the lessor described", async () => {
    const w = await mountSignupAs("LESSOR");
    await fillValid(w);
    await submit(w);
    await flushPromises();
    await w.find("#unitNumber").setValue("19A");
    await w.find("#floor").setValue("19");
    await submit(w);
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith("/auth/signup", expect.objectContaining({
      role: "UNIT_OWNER",
      unit: expect.objectContaining({ unitNumber: "19A", floor: "19" }),
    }));
  });

  it("lets a lessor skip the unit and still apply", async () => {
    const w = await mountSignupAs("LESSOR");
    await fillValid(w);
    await submit(w);
    await flushPromises();
    await w.find(".unit__skip").trigger("click");
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith("/auth/signup", expect.not.objectContaining({ unit: expect.anything() }));
  });

  it("requires a unit number when the lessor does not skip", async () => {
    const w = await mountSignupAs("LESSOR");
    await fillValid(w);
    await submit(w);
    await flushPromises();
    await submit(w); // unit number still blank
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain("Unit number is required.");
  });

  it("names the captured unit on the confirmation", async () => {
    const w = await mountSignupAs("LESSOR");
    await fillValid(w);
    await submit(w);
    await flushPromises();
    await w.find("#unitNumber").setValue("19A");
    await submit(w);
    await flushPromises();
    expect(w.text()).toContain("Application received");
    expect(w.text()).toContain("19A");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/SignupView.test.js --reporter=verbose`
Expected: FAIL — `#unitNumber` never exists; the form submits straight to the API for a lessor.

- [ ] **Step 3: Add the public reference client**

In `client/src/lib/resource.js`, add beside the other exports:

```js
// Reference data for the signed-out signup page — names only. The staff-facing
// `estates`/`towers` above require a token and cannot be used there.
export const publicRefs = {
  estates: () => api.get("/public/estates").then((r) => r.data),
  towers: (estateId) => api.get("/public/towers", { params: { estateId } }).then((r) => r.data),
};
```

- [ ] **Step 4: Add the step state and the unit form**

In `client/src/views/SignupView.vue`, extend the imports:

```js
import { publicRefs } from "../lib/resource.js";
```

Add after the existing `const consent = ref(false);`:

```js
// A lessor is asked for their first unit after the account details — the
// landing card promised "List your unit", and a unit cannot exist until the
// account is approved, so it rides along on the application.
const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "3 Bedrooms Bi-level", "Penthouse"];
const isLessor = computed(() => role.value === "UNIT_OWNER");
const step = ref(1);
const unit = ref({ estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "", type: "", baseRent: "" });
const estateOptions = ref([]);
const towerOptions = ref([]);
const savedUnit = ref(null); // what was actually submitted, for the confirmation

// Changing the role on step 1 must not strand a tenant on the lessor step.
watch(role, () => { if (!isLessor.value) step.value = 1; });
watch(() => unit.value.unitNumber, () => delete errors.value.unitNumber);

async function enterUnitStep() {
  step.value = 2;
  estateOptions.value = await publicRefs.estates();
}
async function onEstateChange() {
  unit.value.towerId = "";
  towerOptions.value = unit.value.estateId ? await publicRefs.towers(unit.value.estateId) : [];
}
```

Replace the existing `submit()` with a pair — `submit()` decides whether to advance or send, and `sendApplication()` does the posting:

```js
async function submit() {
  formError.value = "";
  if (step.value === 1) {
    if (!validate()) return;
    if (isLessor.value) return enterUnitStep();
    return sendApplication(null);
  }
  if (!unit.value.unitNumber.trim()) {
    errors.value = { ...errors.value, unitNumber: "Unit number is required." };
    return;
  }
  const u = { unitNumber: unit.value.unitNumber.trim() };
  for (const k of ["estateId", "towerId", "floor", "slotNo", "type"]) {
    if (unit.value[k]) u[k] = String(unit.value[k]).trim();
  }
  if (unit.value.baseRent !== "") u.baseRent = Number(unit.value.baseRent);
  return sendApplication(u);
}

async function sendApplication(unitPayload) {
  submitting.value = true;
  try {
    const payload = {
      name: name.value.trim(),
      email: username.value.trim(),
      contactEmail: contactEmail.value.trim(),
      password: password.value,
      role: role.value,
      consent: true,
    };
    if (unitPayload) payload.unit = unitPayload;
    await api.post("/auth/signup", payload);
    savedUnit.value = unitPayload;
    submitted.value = true;
  } catch (e) {
    formError.value = e.response?.data?.error || "Could not submit your application.";
  } finally {
    submitting.value = false;
  }
}
```

- [ ] **Step 5: Render the step**

In `client/src/views/SignupView.vue`, wrap the existing account fields so they render only on step 1. The existing `<template v-else>` branch (the form) keeps its `<form @submit.prevent="submit">`; inside it, give the current field block `v-if="step === 1"` and add the unit block after it:

```html
          <div v-if="step === 2" class="unit">
            <h2 class="unit__h">Your unit</h2>
            <p class="unit__lede">Tell us about the unit you would like to list. You can change any of this later.</p>

            <div class="field">
              <label for="estateId">Estate</label>
              <select id="estateId" v-model="unit.estateId" @change="onEstateChange">
                <option value="">Select…</option>
                <option v-for="e in estateOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
              </select>
            </div>

            <div class="field">
              <label for="towerId">Tower</label>
              <select id="towerId" v-model="unit.towerId" :disabled="!unit.estateId">
                <option value="">Select…</option>
                <option v-for="t in towerOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>

            <div class="field">
              <label for="unitNumber">Unit number <span class="req">*</span></label>
              <input id="unitNumber" type="text" v-model="unit.unitNumber" placeholder="e.g. 19A" />
              <p v-if="errors.unitNumber" class="err">{{ errors.unitNumber }}</p>
            </div>

            <div class="field">
              <label for="floor">Floor / level</label>
              <input id="floor" type="text" v-model="unit.floor" placeholder="e.g. 19" />
            </div>

            <div class="field">
              <label for="type">Unit type</label>
              <input id="type" type="text" v-model="unit.type" list="signupUnitTypes" placeholder="e.g. 1 Bedroom" />
              <datalist id="signupUnitTypes">
                <option v-for="t in UNIT_TYPES" :key="t" :value="t"></option>
              </datalist>
            </div>

            <div class="field">
              <label for="baseRent">Monthly rent</label>
              <input id="baseRent" type="number" min="0" step="500" v-model="unit.baseRent" placeholder="e.g. 25000" />
            </div>

            <div class="field">
              <label for="slotNo">Parking slot no.</label>
              <input id="slotNo" type="text" v-model="unit.slotNo" placeholder="e.g. B5-15" />
            </div>

            <button type="button" class="unit__skip" @click="sendApplication(null)">
              Skip for now — I'll add it after approval
            </button>
          </div>
```

The submit button's label depends on the step. Change its text to:

```html
{{ step === 1 && isLessor ? "Continue" : step === 2 ? "Submit application" : "Create account" }}
```

In the `submitted` branch, name the unit when there is one — add after the existing `done__note` paragraph:

```html
          <p v-if="savedUnit" class="done__note">
            We have your unit <strong>{{ savedUnit.unitNumber }}</strong> on file. It will appear under
            My Units once your account is approved.
          </p>
```

Add to the `<style scoped>` block:

```css
.unit__h { margin: 0 0 0.35rem; font-size: 1.05rem; }
.unit__lede { margin: 0 0 1.1rem; font-size: 0.88rem; color: var(--muted); }
.unit__skip {
  background: none; border: none; padding: 0; margin-top: 0.5rem; font: inherit; font-size: 0.85rem;
  color: var(--accent-text); text-decoration: underline; cursor: pointer;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/SignupView.test.js --reporter=verbose`
Expected: PASS — the file's pre-existing tests plus the 6 new ones.

- [ ] **Step 7: Run the full client suite and build**

Run: `npm test && npm run build`
Expected: all files pass; build completes with no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/resource.js client/src/views/SignupView.vue client/tests/SignupView.test.js
git commit -m "feat(signup): ask a lessor for their first unit

The landing card promises \"List your unit\" — now it collects one.
Skippable, and never shown to a tenant."
```

---

### Task 5: The approver sees the applicant's unit

**Files:**
- Modify: `client/src/views/AccountApprovalsView.vue`
- Test: `client/tests/AccountApprovalsView.test.js`

**Interfaces:**
- Consumes: `pendingUnit` on each row of `GET /api/auth/pending`, added to `PENDING_SELECT` in Task 2.

- [ ] **Step 1: Write the failing test**

This file already exists. It mocks `../src/lib/resource.js`, imports `pendingAccounts` from it, and has a `mountView()` helper. Use all three — do not add a second mock or a second helper. Add this test inside its existing top-level `describe`:

```js
  // The approver should see what unit a lessor is claiming before deciding.
  it("shows the unit a lessor applied with, and nothing when they skipped", async () => {
    pendingAccounts.mockResolvedValue([
      { id: "u1", name: "Maria Santos", email: "m.santos", contactEmail: "m@x.com", role: "UNIT_OWNER",
        createdAt: new Date().toISOString(), pendingUnit: { unitNumber: "19A" } },
      { id: "u2", name: "Ana Garcia", email: "a.garcia", contactEmail: "a@x.com", role: "TENANT",
        createdAt: new Date().toISOString(), pendingUnit: null },
    ]);
    const w = await mountView();
    await flushPromises();
    const rows = w.findAll("tbody tr");
    expect(rows[0].text()).toContain("19A");
    expect(rows[1].find(".pending-unit").exists()).toBe(false);
  });
```

If the file's mocked `pendingAccounts` is not a `vi.fn()` supporting `mockResolvedValue`, make it one — the file's other tests already depend on controlling what it returns.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/AccountApprovalsView.test.js --reporter=verbose`
Expected: FAIL — the row does not render the unit.

- [ ] **Step 3: Add the column**

In `client/src/views/AccountApprovalsView.vue`, add a header cell to the `<thead>` row (line 91) between "Applying as" and "Requested":

```html
<th>Unit</th>
```

and the matching body cell after the `role-tag` cell (line 98):

```html
          <td>
            <span v-if="r.pendingUnit" class="pending-unit">
              {{ r.pendingUnit.unitNumber }}
            </span>
            <span v-else class="muted">—</span>
          </td>
```

Add to the `<style scoped>` block:

```css
.pending-unit { font-weight: 600; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/AccountApprovalsView.test.js --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Run the full client suite and build**

Run: `npm test && npm run build`
Expected: all files pass; build clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/AccountApprovalsView.vue client/tests/AccountApprovalsView.test.js
git commit -m "feat(approvals): show the unit an applicant applied with

The approver should see what unit a lessor is claiming before deciding."
```

---

## Verification

After Task 5:

- [ ] `cd server && npm test` — all pass.
- [ ] `cd client && npm test && npm run build` — all pass, clean build.
- [ ] Confirm the column exists on both databases:

```bash
cd server
PSQL="/c/Program Files/PostgreSQL/17/bin/psql.exe"
for F in .env .env.test; do
  URL=$(grep -m1 '^DATABASE_URL=' "$F" | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
  "$PSQL" "$URL" -tAc "select count(*) from information_schema.columns where table_name='User' and column_name='pendingUnit'"
done
```

Expected: `1` twice.

- [ ] Confirm the public endpoints need no token:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5050/api/public/estates
```

Expected: `200` (after the service is restarted onto the new code).
