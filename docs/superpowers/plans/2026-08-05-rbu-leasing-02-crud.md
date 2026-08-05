# RBU Leasing — Plan 2: CRUD APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build REST CRUD APIs (services + routes + role-guarded writes + tests) for all five core entities — owners, units, tenants, leases, payments — on top of the Plan 1 auth foundation.

**Architecture:** Layered Express (routes → controllers → services → Prisma), matching Plan 1. Controllers validate input with Zod and stay thin; services own the logic that matters (foreign-key existence checks, dependent-delete blocking). A shared typed-error module drives HTTP status mapping in a central error handler.

**Tech Stack:** Node.js LTS, Express 5, Prisma 6, PostgreSQL, Zod, Vitest, Supertest.

## Global Constraints

- Prisma pinned to **v6** (`prisma`/`@prisma/client` at `^6`). Do NOT upgrade to v7 — its schema/adapter changes break this codebase.
- ESM modules throughout (`"type": "module"`). Use `import`/`export`, `.js` extensions in relative imports.
- All business logic lives in `server/src/services/`; controllers stay thin (validate + delegate + respond).
- Currency: PHP. Money columns are Prisma `Decimal` — accept JSON numbers on input, serialize as strings on output (frontend formats later).
- Roles: `ADMIN | LEASING_OFFICER | VIEWER`. Reads: any authenticated user. Writes (POST/PATCH/DELETE): `ADMIN` or `LEASING_OFFICER` only (VIEWER → 403).
- Derived values (occupancy, true overdue, rollups) are NOT computed here — that is Plan 3+. CRUD stores and returns fields as written. `Payment.status` is a stored field set by writes.
- Delete is a hard delete, but BLOCKED with 409 when the record has dependents. No cascade, no soft-delete.
- Invalid foreign keys (e.g. a Unit with a non-existent `ownerId`) → 400, not a raw Prisma error.
- No pagination or free-text search (Plan 6). List endpoints return all rows, newest first, with a few exact-match FK/status query filters.
- TDD: every behavior gets a failing test first. Commit after each green task.
- Tests run against the real `rbu_leasing` database (Vitest auto-loads `server/.env`). Auth tokens in tests are minted with `issueToken` — route guards only verify the JWT and role, so no DB user row is needed.

---

## File Structure (this plan)

```
server/
  src/
    lib/
      errors.js              NEW: AppError + NotFoundError, ConflictError, InvalidReferenceError
    middleware/
      auth.js                MODIFY: add requireWrite (ADMIN|LEASING_OFFICER)
      error.js               MODIFY: map ZodError→400, err.status→that status, keep INVALID_CREDENTIALS→401
    validation/
      owner.js               NEW: ownerCreateSchema / ownerUpdateSchema
      tenant.js              NEW
      unit.js                NEW
      lease.js               NEW
      payment.js             NEW
    services/
      ownerService.js        NEW: list/get/create/update/remove (+ dependent check)
      tenantService.js       NEW
      unitService.js         NEW (+ ownerId FK check, filters)
      leaseService.js        NEW (+ unitId/tenantId FK checks, filters)
      paymentService.js      NEW (+ leaseId FK check, filters)
    controllers/
      ownerController.js     NEW  (+ tenant/unit/lease/payment controllers)
    routes/
      ownerRoutes.js         NEW  (+ tenant/unit/lease/payment routes)
    app.js                   MODIFY: mount the 5 new routers
  tests/
    helpers.js               NEW: resetCrudTables, tokens, factory
    errorHandler.test.js     NEW
    owners.test.js           NEW
    tenants.test.js          NEW
    units.test.js            NEW
    leases.test.js           NEW
    payments.test.js         NEW
    crudFlow.test.js         NEW: cross-entity happy-path
```

---

### Task 1: Shared CRUD infrastructure (errors, error mapping, write guard, test helpers)

**Files:**
- Create: `server/src/lib/errors.js`, `server/tests/helpers.js`, `server/tests/errorHandler.test.js`
- Modify: `server/src/middleware/error.js`, `server/src/middleware/auth.js`

**Interfaces:**
- Consumes: `requireRole` (Plan 1 auth), `issueToken` (Plan 1 authService), `prisma` (Plan 1 singleton).
- Produces:
  - `AppError(message, status, code)`, and subclasses `NotFoundError` (404/`NOT_FOUND`), `ConflictError` (409/`CONFLICT`), `InvalidReferenceError` (400/`INVALID_REFERENCE`).
  - `errorHandler` now maps `ZodError → 400 {error, details}`, `err.status → err.status`, `INVALID_CREDENTIALS → 401`, else 500.
  - `requireWrite` — middleware = `requireRole("ADMIN", "LEASING_OFFICER")`.
  - Test helpers: `resetCrudTables()`, `tokens.{admin,officer,viewer}()`, `factory.{owner,tenant,unit,lease,payment}()`.

- [ ] **Step 1: Install Zod**

```bash
npm --workspace server install zod
```

- [ ] **Step 2: Write the failing test**

`server/tests/errorHandler.test.js`:

```js
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../src/lib/errors.js";

function mockRes() {
  return { statusCode: 0, body: null,
    status(c){ this.statusCode = c; return this; },
    json(b){ this.body = b; return this; } };
}

describe("errorHandler", () => {
  it("maps ZodError to 400 with details", () => {
    const res = mockRes();
    let err;
    try { z.object({ name: z.string() }).parse({}); } catch (e) { err = e; }
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("maps NotFoundError to 404", () => {
    const res = mockRes();
    errorHandler(new NotFoundError("nope"), {}, res, () => {});
    expect(res.statusCode).toBe(404);
  });

  it("maps ConflictError to 409", () => {
    const res = mockRes();
    errorHandler(new ConflictError("busy"), {}, res, () => {});
    expect(res.statusCode).toBe(409);
  });

  it("maps InvalidReferenceError to 400", () => {
    const res = mockRes();
    errorHandler(new InvalidReferenceError("bad ref"), {}, res, () => {});
    expect(res.statusCode).toBe(400);
  });

  it("still maps INVALID_CREDENTIALS to 401", () => {
    const res = mockRes();
    errorHandler(new Error("INVALID_CREDENTIALS"), {}, res, () => {});
    expect(res.statusCode).toBe(401);
  });

  it("falls back to 500 for unknown errors", () => {
    const res = mockRes();
    errorHandler(new Error("boom"), {}, res, () => {});
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace server test errorHandler`
Expected: FAIL — cannot import `../src/lib/errors.js` (module not found).

- [ ] **Step 4: Write the implementation**

`server/src/lib/errors.js`:

```js
export class AppError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") { super(message, 404, "NOT_FOUND"); }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") { super(message, 409, "CONFLICT"); }
}

export class InvalidReferenceError extends AppError {
  constructor(message = "Invalid reference") { super(message, 400, "INVALID_REFERENCE"); }
}
```

`server/src/middleware/error.js` (replace the whole file):

```js
import { ZodError } from "zod";

export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err.message === "INVALID_CREDENTIALS") {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
```

`server/src/middleware/auth.js` — add at the end (keep existing `verifyJwt`/`requireRole`):

```js
export const requireWrite = requireRole("ADMIN", "LEASING_OFFICER");
```

`server/tests/helpers.js`:

```js
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";

// Delete in FK-safe order (children before parents).
export async function resetCrudTables() {
  await prisma.payment.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unitOwner.deleteMany();
}

export const tokens = {
  admin: () => issueToken({ id: "test-admin", role: "ADMIN" }),
  officer: () => issueToken({ id: "test-officer", role: "LEASING_OFFICER" }),
  viewer: () => issueToken({ id: "test-viewer", role: "VIEWER" }),
};

// Direct-to-DB record factories for cross-entity test setup.
export const factory = {
  owner: (over = {}) => prisma.unitOwner.create({ data: { name: "Owner", ...over } }),
  tenant: (over = {}) => prisma.tenant.create({ data: { name: "Tenant", ...over } }),
  unit: (ownerId, over = {}) =>
    prisma.unit.create({ data: { ownerId, unitNumber: "101", baseRent: 25000, ...over } }),
  lease: (unitId, tenantId, over = {}) =>
    prisma.lease.create({
      data: {
        unitId, tenantId,
        startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
        monthlyRent: 25000, ...over,
      },
    }),
  payment: (leaseId, over = {}) =>
    prisma.payment.create({
      data: {
        leaseId, periodMonth: new Date("2026-01-01"),
        amount: 25000, dueDate: new Date("2026-01-05"), ...over,
      },
    }),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace server test errorHandler`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `npm --workspace server test`
Expected: PASS — Plan 1's 8 tests + 6 new = 14.

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/errors.js server/src/middleware/error.js server/src/middleware/auth.js server/tests/helpers.js server/tests/errorHandler.test.js server/package.json server/package-lock.json
git commit -m "feat: shared CRUD infra — typed errors, error mapping, write guard, test helpers"
```

---

### Task 2: Owner CRUD

**Files:**
- Create: `server/src/validation/owner.js`, `server/src/services/ownerService.js`, `server/src/controllers/ownerController.js`, `server/src/routes/ownerRoutes.js`, `server/tests/owners.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `prisma`, `NotFoundError`, `ConflictError`, `verifyJwt`, `requireWrite`, test helpers.
- Produces:
  - `ownerCreateSchema`, `ownerUpdateSchema` (Zod).
  - `ownerService`: `listOwners()`, `getOwner(id)`, `createOwner(data)`, `updateOwner(id, data)`, `removeOwner(id)`.
  - Routes under `/api/owners`.

- [ ] **Step 1: Write the failing test**

`server/tests/owners.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Owners CRUD", () => {
  it("officer creates; viewer lists and gets", async () => {
    const created = await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "Ayala Land", email: "owner@example.com" });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const list = await request(app).get("/api/owners")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const got = await request(app).get(`/api/owners/${created.body.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(got.status).toBe(200);
    expect(got.body.name).toBe("Ayala Land");
  });

  it("officer updates an owner", async () => {
    const owner = await factory.owner({ name: "Old" });
    const res = await request(app).patch(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "New" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("viewer cannot create (403)", async () => {
    const res = await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid input (400)", async () => {
    const res = await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ email: "not-an-email" }); // missing name, bad email
    expect(res.status).toBe(400);
  });

  it("404 for a missing owner", async () => {
    const res = await request(app).get("/api/owners/does-not-exist")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(404);
  });

  it("deletes an owner with no units (204)", async () => {
    const owner = await factory.owner();
    const res = await request(app).delete(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(204);
  });

  it("blocks delete when owner has units (409)", async () => {
    const owner = await factory.owner();
    await factory.unit(owner.id);
    const res = await request(app).delete(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test owners`
Expected: FAIL — `/api/owners` routes not mounted (404s) / module not found.

- [ ] **Step 3: Write the implementation**

`server/src/validation/owner.js`:

```js
import { z } from "zod";

export const ownerCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
});

export const ownerUpdateSchema = ownerCreateSchema.partial();
```

`server/src/services/ownerService.js`:

```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";

export function listOwners() {
  return prisma.unitOwner.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getOwner(id) {
  const owner = await prisma.unitOwner.findUnique({ where: { id } });
  if (!owner) throw new NotFoundError("Owner not found");
  return owner;
}

export function createOwner(data) {
  return prisma.unitOwner.create({ data });
}

export async function updateOwner(id, data) {
  await getOwner(id);
  return prisma.unitOwner.update({ where: { id }, data });
}

export async function removeOwner(id) {
  await getOwner(id);
  const units = await prisma.unit.count({ where: { ownerId: id } });
  if (units > 0) throw new ConflictError(`Owner has ${units} unit(s); remove them first`);
  await prisma.unitOwner.delete({ where: { id } });
}
```

`server/src/controllers/ownerController.js`:

```js
import * as service from "../services/ownerService.js";
import { ownerCreateSchema, ownerUpdateSchema } from "../validation/owner.js";

export async function list(req, res, next) {
  try { res.json(await service.listOwners()); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getOwner(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = ownerCreateSchema.parse(req.body);
    res.status(201).json(await service.createOwner(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = ownerUpdateSchema.parse(req.body);
    res.json(await service.updateOwner(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeOwner(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
```

`server/src/routes/ownerRoutes.js`:

```js
import { Router } from "express";
import * as ctrl from "../controllers/ownerController.js";
import { verifyJwt, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireWrite, ctrl.create);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
```

`server/src/app.js` — add the import near the other route imports and mount it. After `import authRoutes from "./routes/authRoutes.js";` add:

```js
import ownerRoutes from "./routes/ownerRoutes.js";
```

And after `app.use("/api/auth", authRoutes);` add:

```js
  app.use("/api/owners", ownerRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test owners`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/validation/owner.js server/src/services/ownerService.js server/src/controllers/ownerController.js server/src/routes/ownerRoutes.js server/src/app.js server/tests/owners.test.js
git commit -m "feat: owner CRUD with validation and dependent-delete guard"
```

---

### Task 3: Tenant CRUD

**Files:**
- Create: `server/src/validation/tenant.js`, `server/src/services/tenantService.js`, `server/src/controllers/tenantController.js`, `server/src/routes/tenantRoutes.js`, `server/tests/tenants.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `prisma`, `NotFoundError`, `ConflictError`, `verifyJwt`, `requireWrite`, test helpers.
- Produces:
  - `tenantCreateSchema`, `tenantUpdateSchema`.
  - `tenantService`: `listTenants()`, `getTenant(id)`, `createTenant(data)`, `updateTenant(id, data)`, `removeTenant(id)` (blocks delete if the tenant has leases).
  - Routes under `/api/tenants`.

- [ ] **Step 1: Write the failing test**

`server/tests/tenants.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Tenants CRUD", () => {
  it("officer creates; viewer lists", async () => {
    const created = await request(app).post("/api/tenants")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "Juan Dela Cruz", email: "juan@example.com" });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/tenants")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("viewer cannot create (403)", async () => {
    const res = await request(app).post("/api/tenants")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid input (400)", async () => {
    const res = await request(app).post("/api/tenants")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ email: "bad" }); // missing name
    expect(res.status).toBe(400);
  });

  it("404 for a missing tenant", async () => {
    const res = await request(app).get("/api/tenants/nope")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(404);
  });

  it("blocks delete when tenant has leases (409)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    await factory.lease(unit.id, tenant.id);
    const res = await request(app).delete(`/api/tenants/${tenant.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test tenants`
Expected: FAIL — routes not mounted / module not found.

- [ ] **Step 3: Write the implementation**

`server/src/validation/tenant.js`:

```js
import { z } from "zod";

export const tenantCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
});

export const tenantUpdateSchema = tenantCreateSchema.partial();
```

`server/src/services/tenantService.js`:

```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";

export function listTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getTenant(id) {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError("Tenant not found");
  return tenant;
}

export function createTenant(data) {
  return prisma.tenant.create({ data });
}

export async function updateTenant(id, data) {
  await getTenant(id);
  return prisma.tenant.update({ where: { id }, data });
}

export async function removeTenant(id) {
  await getTenant(id);
  const leases = await prisma.lease.count({ where: { tenantId: id } });
  if (leases > 0) throw new ConflictError(`Tenant has ${leases} lease(s); remove them first`);
  await prisma.tenant.delete({ where: { id } });
}
```

`server/src/controllers/tenantController.js`:

```js
import * as service from "../services/tenantService.js";
import { tenantCreateSchema, tenantUpdateSchema } from "../validation/tenant.js";

export async function list(req, res, next) {
  try { res.json(await service.listTenants()); } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getTenant(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = tenantCreateSchema.parse(req.body);
    res.status(201).json(await service.createTenant(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = tenantUpdateSchema.parse(req.body);
    res.json(await service.updateTenant(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeTenant(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
```

`server/src/routes/tenantRoutes.js`:

```js
import { Router } from "express";
import * as ctrl from "../controllers/tenantController.js";
import { verifyJwt, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireWrite, ctrl.create);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
```

`server/src/app.js` — add import:

```js
import tenantRoutes from "./routes/tenantRoutes.js";
```

And mount after the owners line:

```js
  app.use("/api/tenants", tenantRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test tenants`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/validation/tenant.js server/src/services/tenantService.js server/src/controllers/tenantController.js server/src/routes/tenantRoutes.js server/src/app.js server/tests/tenants.test.js
git commit -m "feat: tenant CRUD with validation and dependent-delete guard"
```

---

### Task 4: Unit CRUD (owner FK + filters)

**Files:**
- Create: `server/src/validation/unit.js`, `server/src/services/unitService.js`, `server/src/controllers/unitController.js`, `server/src/routes/unitRoutes.js`, `server/tests/units.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `prisma`, `NotFoundError`, `ConflictError`, `InvalidReferenceError`, `verifyJwt`, `requireWrite`, test helpers.
- Produces:
  - `unitCreateSchema`, `unitUpdateSchema`.
  - `unitService`: `listUnits({ ownerId, status })`, `getUnit(id)`, `createUnit(data)` (validates `ownerId`), `updateUnit(id, data)` (validates `ownerId` if present), `removeUnit(id)` (blocks delete if the unit has leases).
  - Routes under `/api/units`, list supports `?ownerId=` and `?status=`.

- [ ] **Step 1: Write the failing test**

`server/tests/units.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Units CRUD", () => {
  it("officer creates a unit for an existing owner", async () => {
    const owner = await factory.owner();
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ ownerId: owner.id, unitNumber: "12A", type: "TWO_BR", baseRent: 45000 });
    expect(res.status).toBe(201);
    expect(res.body.unitNumber).toBe("12A");
    expect(Number(res.body.baseRent)).toBe(45000);
  });

  it("rejects a unit with a non-existent owner (400)", async () => {
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ ownerId: "ghost", unitNumber: "1", baseRent: 1000 });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (400)", async () => {
    const owner = await factory.owner();
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ ownerId: owner.id }); // missing unitNumber and baseRent
    expect(res.status).toBe(400);
  });

  it("filters units by ownerId", async () => {
    const a = await factory.owner({ name: "A" });
    const b = await factory.owner({ name: "B" });
    await factory.unit(a.id, { unitNumber: "A1" });
    await factory.unit(b.id, { unitNumber: "B1" });
    const res = await request(app).get(`/api/units?ownerId=${a.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitNumber).toBe("A1");
  });

  it("viewer cannot create (403)", async () => {
    const owner = await factory.owner();
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ ownerId: owner.id, unitNumber: "1", baseRent: 1000 });
    expect(res.status).toBe(403);
  });

  it("blocks delete when unit has leases (409)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    await factory.lease(unit.id, tenant.id);
    const res = await request(app).delete(`/api/units/${unit.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test units`
Expected: FAIL — routes not mounted / module not found.

- [ ] **Step 3: Write the implementation**

`server/src/validation/unit.js`:

```js
import { z } from "zod";

export const unitCreateSchema = z.object({
  ownerId: z.string().min(1),
  unitNumber: z.string().min(1),
  building: z.string().nullish(),
  floor: z.string().nullish(),
  type: z.enum(["STUDIO", "ONE_BR", "TWO_BR", "THREE_BR", "OTHER"]).optional(),
  sizeSqm: z.coerce.number().nonnegative().nullish(),
  baseRent: z.coerce.number().nonnegative(),
  status: z.enum(["VACANT", "OCCUPIED"]).optional(),
});

export const unitUpdateSchema = unitCreateSchema.partial();
```

`server/src/services/unitService.js`:

```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../lib/errors.js";

async function assertOwnerExists(ownerId) {
  const owner = await prisma.unitOwner.findUnique({ where: { id: ownerId } });
  if (!owner) throw new InvalidReferenceError("ownerId does not reference an existing owner");
}

export function listUnits({ ownerId, status } = {}) {
  const where = {};
  if (ownerId) where.ownerId = ownerId;
  if (status) where.status = status;
  return prisma.unit.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function getUnit(id) {
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) throw new NotFoundError("Unit not found");
  return unit;
}

export async function createUnit(data) {
  await assertOwnerExists(data.ownerId);
  return prisma.unit.create({ data });
}

export async function updateUnit(id, data) {
  await getUnit(id);
  if (data.ownerId) await assertOwnerExists(data.ownerId);
  return prisma.unit.update({ where: { id }, data });
}

export async function removeUnit(id) {
  await getUnit(id);
  const leases = await prisma.lease.count({ where: { unitId: id } });
  if (leases > 0) throw new ConflictError(`Unit has ${leases} lease(s); remove them first`);
  await prisma.unit.delete({ where: { id } });
}
```

`server/src/controllers/unitController.js`:

```js
import * as service from "../services/unitService.js";
import { unitCreateSchema, unitUpdateSchema } from "../validation/unit.js";

export async function list(req, res, next) {
  try {
    const { ownerId, status } = req.query;
    res.json(await service.listUnits({ ownerId, status }));
  } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getUnit(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = unitCreateSchema.parse(req.body);
    res.status(201).json(await service.createUnit(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = unitUpdateSchema.parse(req.body);
    res.json(await service.updateUnit(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeUnit(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
```

`server/src/routes/unitRoutes.js`:

```js
import { Router } from "express";
import * as ctrl from "../controllers/unitController.js";
import { verifyJwt, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireWrite, ctrl.create);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
```

`server/src/app.js` — add import:

```js
import unitRoutes from "./routes/unitRoutes.js";
```

And mount after the tenants line:

```js
  app.use("/api/units", unitRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test units`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/validation/unit.js server/src/services/unitService.js server/src/controllers/unitController.js server/src/routes/unitRoutes.js server/src/app.js server/tests/units.test.js
git commit -m "feat: unit CRUD with owner FK check, filters, dependent-delete guard"
```

---

### Task 5: Lease CRUD (unit + tenant FKs + filters)

**Files:**
- Create: `server/src/validation/lease.js`, `server/src/services/leaseService.js`, `server/src/controllers/leaseController.js`, `server/src/routes/leaseRoutes.js`, `server/tests/leases.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `prisma`, `NotFoundError`, `ConflictError`, `InvalidReferenceError`, `verifyJwt`, `requireWrite`, test helpers.
- Produces:
  - `leaseCreateSchema`, `leaseUpdateSchema`.
  - `leaseService`: `listLeases({ unitId, tenantId, status })`, `getLease(id)`, `createLease(data)` (validates `unitId` and `tenantId`), `updateLease(id, data)` (validates any FK present), `removeLease(id)` (blocks delete if the lease has payments).
  - Routes under `/api/leases`, list supports `?unitId=`, `?tenantId=`, `?status=`.

- [ ] **Step 1: Write the failing test**

`server/tests/leases.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Leases CRUD", () => {
  it("officer creates a lease for an existing unit and tenant", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({
        unitId: unit.id, tenantId: tenant.id,
        startDate: "2026-01-01", endDate: "2026-12-31",
        monthlyRent: 30000, deposit: 60000,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.monthlyRent)).toBe(30000);
  });

  it("rejects a lease with a non-existent unit (400)", async () => {
    const tenant = await factory.tenant();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ unitId: "ghost", tenantId: tenant.id, startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 1000 });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (400)", async () => {
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ monthlyRent: 1000 }); // missing unitId, tenantId, dates
    expect(res.status).toBe(400);
  });

  it("filters leases by tenantId", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const t1 = await factory.tenant({ name: "T1" });
    const t2 = await factory.tenant({ name: "T2" });
    await factory.lease(unit.id, t1.id);
    await factory.lease(unit.id, t2.id);
    const res = await request(app).get(`/api/leases?tenantId=${t1.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tenantId).toBe(t1.id);
  });

  it("viewer cannot create (403)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ unitId: unit.id, tenantId: tenant.id, startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 1000 });
    expect(res.status).toBe(403);
  });

  it("blocks delete when lease has payments (409)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    const lease = await factory.lease(unit.id, tenant.id);
    await factory.payment(lease.id);
    const res = await request(app).delete(`/api/leases/${lease.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test leases`
Expected: FAIL — routes not mounted / module not found.

- [ ] **Step 3: Write the implementation**

`server/src/validation/lease.js`:

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
});

export const leaseUpdateSchema = leaseCreateSchema.partial();
```

`server/src/services/leaseService.js`:

```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../lib/errors.js";

async function assertUnitExists(unitId) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw new InvalidReferenceError("unitId does not reference an existing unit");
}

async function assertTenantExists(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new InvalidReferenceError("tenantId does not reference an existing tenant");
}

export function listLeases({ unitId, tenantId, status } = {}) {
  const where = {};
  if (unitId) where.unitId = unitId;
  if (tenantId) where.tenantId = tenantId;
  if (status) where.status = status;
  return prisma.lease.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function getLease(id) {
  const lease = await prisma.lease.findUnique({ where: { id } });
  if (!lease) throw new NotFoundError("Lease not found");
  return lease;
}

export async function createLease(data) {
  await assertUnitExists(data.unitId);
  await assertTenantExists(data.tenantId);
  return prisma.lease.create({ data });
}

export async function updateLease(id, data) {
  await getLease(id);
  if (data.unitId) await assertUnitExists(data.unitId);
  if (data.tenantId) await assertTenantExists(data.tenantId);
  return prisma.lease.update({ where: { id }, data });
}

export async function removeLease(id) {
  await getLease(id);
  const payments = await prisma.payment.count({ where: { leaseId: id } });
  if (payments > 0) throw new ConflictError(`Lease has ${payments} payment(s); remove them first`);
  await prisma.lease.delete({ where: { id } });
}
```

`server/src/controllers/leaseController.js`:

```js
import * as service from "../services/leaseService.js";
import { leaseCreateSchema, leaseUpdateSchema } from "../validation/lease.js";

export async function list(req, res, next) {
  try {
    const { unitId, tenantId, status } = req.query;
    res.json(await service.listLeases({ unitId, tenantId, status }));
  } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getLease(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = leaseCreateSchema.parse(req.body);
    res.status(201).json(await service.createLease(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = leaseUpdateSchema.parse(req.body);
    res.json(await service.updateLease(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removeLease(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
```

`server/src/routes/leaseRoutes.js`:

```js
import { Router } from "express";
import * as ctrl from "../controllers/leaseController.js";
import { verifyJwt, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireWrite, ctrl.create);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
```

`server/src/app.js` — add import:

```js
import leaseRoutes from "./routes/leaseRoutes.js";
```

And mount after the units line:

```js
  app.use("/api/leases", leaseRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test leases`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/validation/lease.js server/src/services/leaseService.js server/src/controllers/leaseController.js server/src/routes/leaseRoutes.js server/src/app.js server/tests/leases.test.js
git commit -m "feat: lease CRUD with unit/tenant FK checks, filters, dependent-delete guard"
```

---

### Task 6: Payment CRUD (lease FK + filters)

**Files:**
- Create: `server/src/validation/payment.js`, `server/src/services/paymentService.js`, `server/src/controllers/paymentController.js`, `server/src/routes/paymentRoutes.js`, `server/tests/payments.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `prisma`, `NotFoundError`, `InvalidReferenceError`, `verifyJwt`, `requireWrite`, test helpers.
- Produces:
  - `paymentCreateSchema`, `paymentUpdateSchema`.
  - `paymentService`: `listPayments({ leaseId, status })`, `getPayment(id)`, `createPayment(data)` (validates `leaseId`), `updatePayment(id, data)` (validates `leaseId` if present), `removePayment(id)` (no dependents — always allowed).
  - Routes under `/api/payments`, list supports `?leaseId=`, `?status=`.

- [ ] **Step 1: Write the failing test**

`server/tests/payments.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function leaseFixture() {
  const owner = await factory.owner();
  const unit = await factory.unit(owner.id);
  const tenant = await factory.tenant();
  return factory.lease(unit.id, tenant.id);
}

describe("Payments CRUD", () => {
  it("officer records a payment for an existing lease", async () => {
    const lease = await leaseFixture();
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ leaseId: lease.id, periodMonth: "2026-01-01", amount: 30000, dueDate: "2026-01-05", status: "PAID", method: "GCASH" });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(30000);
    expect(res.body.status).toBe("PAID");
  });

  it("rejects a payment with a non-existent lease (400)", async () => {
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ leaseId: "ghost", periodMonth: "2026-01-01", amount: 1000, dueDate: "2026-01-05" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (400)", async () => {
    const lease = await leaseFixture();
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ leaseId: lease.id }); // missing periodMonth, amount, dueDate
    expect(res.status).toBe(400);
  });

  it("filters payments by leaseId", async () => {
    const l1 = await leaseFixture();
    const l2 = await leaseFixture();
    await factory.payment(l1.id);
    await factory.payment(l2.id);
    const res = await request(app).get(`/api/payments?leaseId=${l1.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].leaseId).toBe(l1.id);
  });

  it("viewer cannot create (403)", async () => {
    const lease = await leaseFixture();
    const res = await request(app).post("/api/payments")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ leaseId: lease.id, periodMonth: "2026-01-01", amount: 1000, dueDate: "2026-01-05" });
    expect(res.status).toBe(403);
  });

  it("deletes a payment (204) — no dependents", async () => {
    const lease = await leaseFixture();
    const payment = await factory.payment(lease.id);
    const res = await request(app).delete(`/api/payments/${payment.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test payments`
Expected: FAIL — routes not mounted / module not found.

- [ ] **Step 3: Write the implementation**

`server/src/validation/payment.js`:

```js
import { z } from "zod";

export const paymentCreateSchema = z.object({
  leaseId: z.string().min(1),
  periodMonth: z.coerce.date(),
  amount: z.coerce.number().nonnegative(),
  dueDate: z.coerce.date(),
  paidDate: z.coerce.date().nullish(),
  status: z.enum(["PAID", "PENDING", "OVERDUE"]).optional(),
  method: z.string().nullish(),
});

export const paymentUpdateSchema = paymentCreateSchema.partial();
```

`server/src/services/paymentService.js`:

```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

async function assertLeaseExists(leaseId) {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new InvalidReferenceError("leaseId does not reference an existing lease");
}

export function listPayments({ leaseId, status } = {}) {
  const where = {};
  if (leaseId) where.leaseId = leaseId;
  if (status) where.status = status;
  return prisma.payment.findMany({ where, orderBy: { dueDate: "desc" } });
}

export async function getPayment(id) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new NotFoundError("Payment not found");
  return payment;
}

export async function createPayment(data) {
  await assertLeaseExists(data.leaseId);
  return prisma.payment.create({ data });
}

export async function updatePayment(id, data) {
  await getPayment(id);
  if (data.leaseId) await assertLeaseExists(data.leaseId);
  return prisma.payment.update({ where: { id }, data });
}

export async function removePayment(id) {
  await getPayment(id);
  await prisma.payment.delete({ where: { id } });
}
```

`server/src/controllers/paymentController.js`:

```js
import * as service from "../services/paymentService.js";
import { paymentCreateSchema, paymentUpdateSchema } from "../validation/payment.js";

export async function list(req, res, next) {
  try {
    const { leaseId, status } = req.query;
    res.json(await service.listPayments({ leaseId, status }));
  } catch (e) { next(e); }
}
export async function get(req, res, next) {
  try { res.json(await service.getPayment(req.params.id)); } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try {
    const data = paymentCreateSchema.parse(req.body);
    res.status(201).json(await service.createPayment(data));
  } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try {
    const data = paymentUpdateSchema.parse(req.body);
    res.json(await service.updatePayment(req.params.id, data));
  } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { await service.removePayment(req.params.id); res.status(204).end(); } catch (e) { next(e); }
}
```

`server/src/routes/paymentRoutes.js`:

```js
import { Router } from "express";
import * as ctrl from "../controllers/paymentController.js";
import { verifyJwt, requireWrite } from "../middleware/auth.js";

const router = Router();
router.use(verifyJwt);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireWrite, ctrl.create);
router.patch("/:id", requireWrite, ctrl.update);
router.delete("/:id", requireWrite, ctrl.remove);
export default router;
```

`server/src/app.js` — add import:

```js
import paymentRoutes from "./routes/paymentRoutes.js";
```

And mount after the leases line:

```js
  app.use("/api/payments", paymentRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test payments`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/validation/payment.js server/src/services/paymentService.js server/src/controllers/paymentController.js server/src/routes/paymentRoutes.js server/src/app.js server/tests/payments.test.js
git commit -m "feat: payment CRUD with lease FK check and filters"
```

---

### Task 7: Cross-entity happy path + full regression

**Files:**
- Create: `server/tests/crudFlow.test.js`

**Interfaces:**
- Consumes: `createApp`, test helpers. Exercises all five resources through the HTTP layer in one realistic sequence.
- Produces: an end-to-end regression test proving the full owner→unit→tenant→lease→payment chain works via the API.

- [ ] **Step 1: Write the failing test**

`server/tests/crudFlow.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens } from "./helpers.js";

const app = createApp();
const auth = () => ({ Authorization: `Bearer ${tokens.officer()}` });
beforeEach(async () => { await resetCrudTables(); });

describe("End-to-end CRUD flow", () => {
  it("creates owner → unit → tenant → lease → payment via the API", async () => {
    const owner = await request(app).post("/api/owners").set(auth())
      .send({ name: "Ortigas Land" });
    expect(owner.status).toBe(201);

    const unit = await request(app).post("/api/units").set(auth())
      .send({ ownerId: owner.body.id, unitNumber: "PH-1", type: "THREE_BR", baseRent: 80000 });
    expect(unit.status).toBe(201);

    const tenant = await request(app).post("/api/tenants").set(auth())
      .send({ name: "Maria Santos", email: "maria@example.com" });
    expect(tenant.status).toBe(201);

    const lease = await request(app).post("/api/leases").set(auth())
      .send({ unitId: unit.body.id, tenantId: tenant.body.id, startDate: "2026-02-01", endDate: "2027-01-31", monthlyRent: 80000, deposit: 160000 });
    expect(lease.status).toBe(201);

    const payment = await request(app).post("/api/payments").set(auth())
      .send({ leaseId: lease.body.id, periodMonth: "2026-02-01", amount: 80000, dueDate: "2026-02-05", status: "PAID", method: "BANK" });
    expect(payment.status).toBe(201);

    const payments = await request(app).get(`/api/payments?leaseId=${lease.body.id}`).set(auth());
    expect(payments.status).toBe(200);
    expect(payments.body).toHaveLength(1);
    expect(Number(payments.body[0].amount)).toBe(80000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or passes)**

Run: `npm --workspace server test crudFlow`
Expected: PASS if Tasks 2–6 are complete (all routes mounted). If any resource 404s, that resource's routes are not mounted in `app.js` — fix before proceeding.

- [ ] **Step 3: Run the FULL suite to confirm no regression**

Run: `npm --workspace server test`
Expected: PASS — all suites green (Plan 1: 8; Task 1: 6; owners 7; tenants 5; units 6; leases 6; payments 6; crudFlow 1 = 45 tests).

- [ ] **Step 4: Commit**

```bash
git add server/tests/crudFlow.test.js
git commit -m "test: end-to-end CRUD flow across all five entities"
```

---

## Self-Review

**Spec coverage (this plan's slice):** Spec build-order item 3 is "CRUD APIs … for owners, units, tenants, leases, payments." All five entities get full list/get/create/update/delete (Tasks 2–6) ✓. Role-guarded writes — VIEWER blocked from writes, ADMIN/LEASING_OFFICER allowed (`requireWrite`, tested per entity) ✓. Layered architecture with logic in services (FK checks, dependent guards) and thin controllers ✓. Decimal money fields accepted as numbers, returned as strings ✓. Derived math correctly excluded (deferred to Plan 3+) ✓. Vue screens correctly excluded (later plan) ✓. Pagination correctly excluded (Plan 6) ✓.

**Placeholder scan:** No TBD/TODO. Every code step contains complete, runnable code. Every `app.js` modify names the exact import and mount line to add.

**Type consistency:** All services expose the same `list/get/create/update/remove` shape; controllers use identical names; routes wire identically. `InvalidReferenceError`/`NotFoundError`/`ConflictError` are defined in Task 1 and consumed by name in Tasks 4–6. Test helpers (`resetCrudTables`, `tokens`, `factory`) are defined in Task 1 and used by name in Tasks 2–7. `requireWrite` defined in Task 1 (auth.js), imported in every route file. Money assertions use `Number(res.body.<field>)` to account for Decimal→string serialization.

**Test count math:** errorHandler 6 + owners 7 + tenants 5 + units 6 + leases 6 + payments 6 + crudFlow 1 = 37 new; plus Plan 1's 8 = **45 total** at the end of Task 7.

## Later Plans (preview)

- **Plan 3 — Dashboard metrics + Vue screens for CRUD** (or split): occupancy, income, expiring windows, overdue/outstanding, new-this-month, counts — all computed in services from this CRUD data.
- **Plan 4 — Executive Summary:** period selection + prior-period comparison.
- **Plan 5 — Excel reports:** rent roll, collections, lease expiry, owner statement via ExcelJS.
- **Plan 6 — Hardening:** token persistence, pagination, richer validation, polish.
