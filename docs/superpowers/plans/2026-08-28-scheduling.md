# Scheduling (Appointments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a leasing officer schedule the Unit Inspection, Key Turnover, and Photoshoot on a transaction; both parties see it; the leasing stage status stays in sync automatically.

**Architecture:** One `Appointment` row per `(transaction, stage)`. A new `appointmentService` performs schedule/reschedule/complete/cancel, each writing the transaction's stage status (via `stageData`) and a `TransactionEvent`. Routes under `/api/appointments` (staff write; parties read their own). Client: a staff Scheduling panel on Transaction Detail and a read-only portal card.

**Tech Stack:** Node/Express, Prisma/PostgreSQL, Zod, Vitest + Supertest (server), Vitest + @vue/test-utils (client), Vue 3.

## Global Constraints

- Additive only; nullable/defaulted columns; never truncate or drop. Migration is applied via idempotent SQL (`CREATE TABLE IF NOT EXISTS`) to dev + test, NOT `prisma migrate dev` (the local migration history is diverged and would demand a destructive reset).
- Tests run against `rbu_leasing_test` only (guarded by `server/tests/setup.env.js`). Never point tests at the dev DB; never run migrate/reset/db push from a subagent.
- Schedulable stages and their completion outcomes come from `shared/leasingStages.js` `SCHEDULABLE_STAGES` — every outcome value MUST be a real status of that stage in `LEASING_STAGES`. Appointment statuses come from `APPOINTMENT_STATUSES` = `["Scheduled","Rescheduled","Completed","Cancelled","No-show"]`.
- Stage-status write rule: always set `stageData[stage].status`; additionally set the transaction's top-level `status` only when `stage === transaction.stage`. Use the existing `logEvent`/`stageData` conventions from `leasingTransactionService.js`.
- The service never advances the transaction to the next stage — advancing stays the officer's explicit action in the existing stage engine.

---

### Task 1: Shared schedulable-stage config

**Files:**
- Modify: `shared/leasingStages.js` (append after the existing exports)
- Test: `server/tests/leasingStages.test.js` (extend) — or `shared` client test if that's where stage tests live; use the server test file that already imports from `shared/leasingStages.js`.

**Interfaces:**
- Produces: `SCHEDULABLE_STAGES` (object), `SCHEDULABLE_STAGE_KEYS` (string[]), `APPOINTMENT_STATUSES` (string[]), and a helper `isSchedulableStage(key)`.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/leasingStages.test.js` (match its existing import style — it already imports from `../../shared/leasingStages.js`):

```js
import {
  SCHEDULABLE_STAGES, SCHEDULABLE_STAGE_KEYS, APPOINTMENT_STATUSES, isSchedulableStage, LEASING_STAGES,
} from "../../shared/leasingStages.js";

describe("schedulable stages", () => {
  it("exposes the three schedulable stages with valid outcomes", () => {
    expect(SCHEDULABLE_STAGE_KEYS).toEqual(["UNIT_INSPECTION", "KEY_TURNOVER", "PHOTOSHOOT"]);
    for (const key of SCHEDULABLE_STAGE_KEYS) {
      const stage = LEASING_STAGES.find((s) => s.key === key);
      const cfg = SCHEDULABLE_STAGES[key];
      expect(stage.statuses).toContain(cfg.defaultOutcome);
      for (const o of cfg.outcomeOptions || []) expect(stage.statuses).toContain(o);
    }
    expect(isSchedulableStage("UNIT_INSPECTION")).toBe(true);
    expect(isSchedulableStage("INQUIRY")).toBe(false);
  });
  it("appointment statuses are the standard lifecycle", () => {
    expect(APPOINTMENT_STATUSES).toEqual(["Scheduled", "Rescheduled", "Completed", "Cancelled", "No-show"]);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run from `server/`:
```bash
npx vitest run tests/leasingStages.test.js -t "schedulable"
```
Expected: FAIL — the new exports don't exist.

- [ ] **Step 3: Add the exports**

Append to `shared/leasingStages.js`:

```js
// --- Scheduling (sub-project H) ---------------------------------------------
// The stages that carry an appointment. `defaultOutcome` is the stage status
// set when the appointment is completed; `outcomeOptions` (inspection) lets the
// officer pick a specific result. Every value is a real status of its stage.
export const SCHEDULABLE_STAGES = {
  UNIT_INSPECTION: { defaultOutcome: "Passed", outcomeOptions: ["Passed", "Passed with Remarks", "For Rectification", "Failed"] },
  KEY_TURNOVER:    { defaultOutcome: "Completed" },
  PHOTOSHOOT:      { defaultOutcome: "Completed" },
};
export const SCHEDULABLE_STAGE_KEYS = Object.keys(SCHEDULABLE_STAGES);
export const APPOINTMENT_STATUSES = ["Scheduled", "Rescheduled", "Completed", "Cancelled", "No-show"];
export function isSchedulableStage(key) {
  return Object.prototype.hasOwnProperty.call(SCHEDULABLE_STAGES, key);
}
```

- [ ] **Step 4: Run it — verify pass**
```bash
npx vitest run tests/leasingStages.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add shared/leasingStages.js server/tests/leasingStages.test.js
git commit -m "feat(scheduling): schedulable-stage config + appointment statuses"
```

---

### Task 2: Appointment model + additive table

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Appointment`; back-relation on `LeasingTransaction`)
- Create: `server/prisma/manual-migrations/2026-08-28-appointments.sql`

**Interfaces:**
- Produces: `prisma.appointment` delegate with the fields below; `LeasingTransaction.appointments`.

> This task performs a DB migration. It is executed by the controller (not a subagent) because it stops the dev server and runs raw SQL against dev + test. If you are a subagent and were dispatched this task, STOP and report BLOCKED (controller-only).

- [ ] **Step 1: Add the model**

In `server/prisma/schema.prisma`, add to `model LeasingTransaction` (beside `events`/`documents`):
```prisma
  appointments Appointment[]
```
And add the model:
```prisma
model Appointment {
  id              String   @id @default(cuid())
  transaction     LeasingTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  transactionId   String
  stage           String
  status          String   @default("Scheduled")
  scheduledAt     DateTime
  location        String?
  notes           String?
  outcome         String?
  reason          String?
  rescheduleCount Int      @default(0)
  createdById     String?
  createdByName   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([transactionId, stage])
  @@index([transactionId])
}
```

- [ ] **Step 2: Write the SQL migration**

Create `server/prisma/manual-migrations/2026-08-28-appointments.sql`:
```sql
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Scheduled',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "notes" TEXT,
  "outcome" TEXT,
  "reason" TEXT,
  "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_transactionId_stage_key" ON "Appointment"("transactionId", "stage");
CREATE INDEX IF NOT EXISTS "Appointment_transactionId_idx" ON "Appointment"("transactionId");
DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "LeasingTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 3: Apply to dev + test and regenerate (controller runs this; stop the server first)**
```bash
npx prisma db execute --url "postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing?schema=public" --file prisma/manual-migrations/2026-08-28-appointments.sql
npx prisma db execute --url "postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing_test?schema=public" --file prisma/manual-migrations/2026-08-28-appointments.sql
npx prisma generate
```
Expected: both "Script executed successfully"; client regenerates.

- [ ] **Step 4: Verify the delegate**
```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log(!!p.appointment)"
```
Expected: `true`.

- [ ] **Step 5: Commit**
```bash
git add server/prisma/schema.prisma server/prisma/manual-migrations/2026-08-28-appointments.sql
git commit -m "feat(scheduling): Appointment table (additive SQL; no migrate file due to history drift)"
```

---

### Task 3: Appointment service + routes — schedule, list, scoping

**Files:**
- Create: `server/src/services/appointmentService.js`, `server/src/validation/appointment.js`, `server/src/controllers/appointmentController.js`, `server/src/routes/appointmentRoutes.js`
- Modify: `server/src/app.js` (mount `/api/appointments`)
- Test: `server/tests/appointments.test.js` (new)

**Interfaces:**
- Consumes: `prisma`, `shared/leasingStages.js` (`SCHEDULABLE_STAGES`, `SCHEDULABLE_STAGE_KEYS`, `isSchedulableStage`, `isValidStatus`, `stageByKey`), and from `leasingTransactionService.js` the exported `assertCanAccess`.
- Produces: `scheduleAppointment(user, txnId, stage, body)`, `listForTransaction(user, txnId)`, `listMine(user)`; routes `GET /api/appointments/mine`, `GET /api/appointments/transaction/:txnId`, `POST /api/appointments/transaction/:txnId/:stage`. Later tasks add `reschedule/complete/cancel`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/appointments.test.js`. Study `server/tests/leasingTransactions.test.js` first for how it seeds a transaction (factory/helpers, tokens) and reuse that exact setup. Skeleton (adapt the seed to the real helpers):

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

// Seed a transaction sitting at UNIT_INSPECTION, linked to an owner + tenant.
async function txnAtInspection() {
  const owner = await factory.owner({ name: "Owner Co" });
  const tenant = await factory.tenant({ name: "Lessee Co" });
  return prisma.leasingTransaction.create({
    data: {
      reference: "RBU-2026-000001", stage: "UNIT_INSPECTION", status: "Pending",
      stageData: { UNIT_INSPECTION: { status: "Pending", startedAt: new Date().toISOString() } },
      tenantId: tenant.id, unitOwnerId: owner.id,
    },
  });
}

describe("Appointments — schedule/list", () => {
  it("officer schedules an inspection → row Scheduled, stage synced, event logged", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ scheduledAt: "2026-09-01T09:00:00.000Z", location: "Tower A Lobby", notes: "Bring IDs" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Scheduled");
    expect(res.body.stage).toBe("UNIT_INSPECTION");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Scheduled");
    expect(txn.stageData.UNIT_INSPECTION.status).toBe("Scheduled");
    const events = await prisma.transactionEvent.findMany({ where: { transactionId: t.id } });
    expect(events.some((e) => /schedul/i.test(e.message))).toBe(true);
  });

  it("rejects a non-schedulable stage (400)", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/APPROVAL`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing/invalid scheduledAt (400)", async () => {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ location: "x" });
    expect(res.status).toBe(400);
  });

  it("second schedule for the same stage upserts (no duplicate)", async () => {
    const t = await txnAtInspection();
    const hdr = { Authorization: `Bearer ${tokens.officer()}` };
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`).set(hdr).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`).set(hdr).send({ scheduledAt: "2026-09-02T09:00:00.000Z" });
    const rows = await prisma.appointment.findMany({ where: { transactionId: t.id, stage: "UNIT_INSPECTION" } });
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].scheduledAt).toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });

  it("a unit owner cannot schedule (403) but can read their own (200); a stranger 404s", async () => {
    const t = await txnAtInspection();
    const owner = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    const w = await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`)
      .set("Authorization", `Bearer ${tokens.owner(owner.unitOwnerId)}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    expect(w.status).toBe(403);
    await request(app).post(`/api/appointments/transaction/${t.id}/UNIT_INSPECTION`).set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    const readOwn = await request(app).get(`/api/appointments/transaction/${t.id}`).set("Authorization", `Bearer ${tokens.owner(owner.unitOwnerId)}`);
    expect(readOwn.status).toBe(200);
    expect(readOwn.body).toHaveLength(1);
    const stranger = await request(app).get(`/api/appointments/transaction/${t.id}`).set("Authorization", `Bearer ${tokens.owner("other-owner")}`);
    expect(stranger.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — verify fail**
```bash
npx vitest run tests/appointments.test.js
```
Expected: FAIL (routes/service absent → 404s).

- [ ] **Step 3: Validation schema**

Create `server/src/validation/appointment.js`:
```js
import { z } from "zod";
import { APPOINTMENT_STATUSES } from "../../../shared/leasingStages.js";

export const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const completeSchema = z.object({
  outcome: z.string().optional().nullable(),
});
export const cancelSchema = z.object({
  status: z.enum(["Cancelled", "No-show"]).default("Cancelled"),
  reason: z.string().optional().nullable(),
});
export { APPOINTMENT_STATUSES };
```

- [ ] **Step 4: Service (schedule/list this task; lifecycle added in Task 4)**

Create `server/src/services/appointmentService.js`:
```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError, ConflictError } from "../lib/errors.js";
import {
  SCHEDULABLE_STAGES, isSchedulableStage, stageByKey, stageIndex, isFinalStage,
} from "../../../shared/leasingStages.js";
import { assertCanAccess } from "./leasingTransactionService.js";

async function resolveName(user) {
  if (user?.userId) {
    const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, email: true } });
    if (u) return u.name || u.email || null;
  }
  return null;
}
async function logEvent(transactionId, actor, message, stage) {
  await prisma.transactionEvent.create({
    data: { transactionId, actorId: actor?.userId || null, actorName: await resolveName(actor), actorRole: actor?.role || null, stage: stage || null, message },
  });
}
// Write a stage's status into the transaction: always stageData[stage].status;
// top-level status only when it is the current stage.
async function syncStageStatus(txn, stage, status) {
  const stageData = { ...(txn.stageData || {}) };
  stageData[stage] = { ...(stageData[stage] || {}), status };
  const patch = { stageData };
  if (stage === txn.stage) { patch.status = status; if (isFinalStage(stage)) patch.finalStatus = status; }
  await prisma.leasingTransaction.update({ where: { id: txn.id }, data: patch });
}

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];

export async function listForTransaction(user, txnId) {
  await assertCanAccess(user, txnId); // 404 if not staff/owner/tenant
  return prisma.appointment.findMany({ where: { transactionId: txnId }, orderBy: { stage: "asc" } });
}
export async function listMine(user) {
  let where = null;
  if (user?.role === "TENANT" && user.tenantId) where = { transaction: { tenantId: user.tenantId } };
  else if (user?.role === "UNIT_OWNER" && user.unitOwnerId) where = { transaction: { unitOwnerId: user.unitOwnerId } };
  if (!where) return [];
  return prisma.appointment.findMany({
    where, orderBy: { scheduledAt: "asc" },
    include: { transaction: { select: { id: true, reference: true } } },
  });
}
export async function scheduleAppointment(user, txnId, stage, body) {
  if (!isSchedulableStage(stage)) throw new InvalidReferenceError(`"${stage}" is not a schedulable stage`);
  const txn = await prisma.leasingTransaction.findUnique({ where: { id: txnId } });
  if (!txn) throw new NotFoundError("Transaction not found");
  // Cannot schedule a stage the transaction has already moved past.
  if (stageIndex(stage) < stageIndex(txn.stage) && (txn.stageData?.[stage]?.completedAt)) {
    throw new ConflictError("That stage is already completed");
  }
  const appt = await prisma.appointment.upsert({
    where: { transactionId_stage: { transactionId: txnId, stage } },
    create: {
      transactionId: txnId, stage, status: "Scheduled",
      scheduledAt: new Date(body.scheduledAt), location: body.location ?? null, notes: body.notes ?? null,
      createdById: user?.userId || null, createdByName: await resolveName(user),
    },
    update: { status: "Scheduled", scheduledAt: new Date(body.scheduledAt), location: body.location ?? null, notes: body.notes ?? null },
  });
  await syncStageStatus(txn, stage, "Scheduled");
  await logEvent(txnId, user, `${stageByKey(stage).label} scheduled for ${new Date(body.scheduledAt).toISOString()}`, stage);
  return appt;
}
```

- [ ] **Step 5: Controller**

Create `server/src/controllers/appointmentController.js`:
```js
import * as svc from "../services/appointmentService.js";
import { scheduleSchema } from "../validation/appointment.js";

export async function mine(req, res, next) {
  try { res.json(await svc.listMine(req.user)); } catch (e) { next(e); }
}
export async function forTransaction(req, res, next) {
  try { res.json(await svc.listForTransaction(req.user, req.params.txnId)); } catch (e) { next(e); }
}
export async function schedule(req, res, next) {
  try {
    const body = scheduleSchema.parse(req.body);
    res.status(201).json(await svc.scheduleAppointment(req.user, req.params.txnId, req.params.stage, body));
  } catch (e) { next(e); }
}
```

- [ ] **Step 6: Routes**

Create `server/src/routes/appointmentRoutes.js` (match the middleware imports used by an existing route file such as `lessorRequirementRoutes.js`):
```js
import { Router } from "express";
import { verifyJwt, requireWrite } from "../middleware/auth.js";
import * as ctrl from "../controllers/appointmentController.js";

const r = Router();
r.use(verifyJwt);
r.get("/mine", ctrl.mine);
r.get("/transaction/:txnId", ctrl.forTransaction);
r.post("/transaction/:txnId/:stage", requireWrite, ctrl.schedule);
export default r;
```

- [ ] **Step 7: Mount in app.js**

In `server/src/app.js`, import and mount alongside the other routers:
```js
import appointmentRoutes from "./routes/appointmentRoutes.js";
// ...
app.use("/api/appointments", appointmentRoutes);
```

- [ ] **Step 8: Run — verify pass**
```bash
npx vitest run tests/appointments.test.js
```
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add server/src/services/appointmentService.js server/src/validation/appointment.js server/src/controllers/appointmentController.js server/src/routes/appointmentRoutes.js server/src/app.js server/tests/appointments.test.js
git commit -m "feat(scheduling): schedule + list appointments, stage auto-sync"
```

---

### Task 4: Appointment lifecycle — reschedule, complete, cancel

**Files:**
- Modify: `server/src/services/appointmentService.js`, `server/src/controllers/appointmentController.js`, `server/src/routes/appointmentRoutes.js`
- Test: `server/tests/appointments.test.js` (extend)

**Interfaces:**
- Consumes: `SCHEDULABLE_STAGES`, `isValidStatus`; the `syncStageStatus`/`logEvent`/`resolveName` helpers from Task 3.
- Produces: `reschedule(user, id, body)`, `complete(user, id, body)`, `cancel(user, id, body)`; routes `PATCH /api/appointments/:id/reschedule|complete|cancel`.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/appointments.test.js` (reuse `txnAtInspection` and an inline "schedule then act" helper). Cover:

```js
describe("Appointments — lifecycle", () => {
  async function scheduled(stage = "UNIT_INSPECTION") {
    const t = await txnAtInspection();
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/${stage}`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    return { t, id: res.body.id };
  }

  it("reschedule updates time, sets Rescheduled, increments count", async () => {
    const { id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/reschedule`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-05T10:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Rescheduled");
    expect(res.body.rescheduleCount).toBe(1);
  });

  it("complete without outcome applies the stage default (turnover → Completed)", async () => {
    // seed a txn at KEY_TURNOVER
    const owner = await factory.owner(); const tenant = await factory.tenant();
    const t = await prisma.leasingTransaction.create({ data: {
      reference: "RBU-2026-000009", stage: "KEY_TURNOVER", status: "Pending",
      stageData: { KEY_TURNOVER: { status: "Pending" } }, tenantId: tenant.id, unitOwnerId: owner.id } });
    const s = await request(app).post(`/api/appointments/transaction/${t.id}/KEY_TURNOVER`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ scheduledAt: "2026-09-01T09:00:00.000Z" });
    const res = await request(app).patch(`/api/appointments/${s.body.id}/complete`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Completed");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Completed");
  });

  it("complete an inspection with outcome Failed sets the stage to Failed", async () => {
    const { t, id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Failed" });
    expect(res.status).toBe(200);
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Failed");
  });

  it("rejects an outcome that isn't valid for the stage (400)", async () => {
    const { id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Completed" }); // not an inspection status
    expect(res.status).toBe(400);
  });

  it("cancel sets the stage back to Pending; No-show is accepted", async () => {
    const { t, id } = await scheduled();
    const res = await request(app).patch(`/api/appointments/${id}/cancel`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "No-show", reason: "party absent" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("No-show");
    const txn = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    expect(txn.status).toBe("Pending");
  });

  it("completing an already-completed appointment 409s; owner cannot complete (403)", async () => {
    const { t, id } = await scheduled();
    const owner = await prisma.leasingTransaction.findUnique({ where: { id: t.id } });
    const forbidden = await request(app).patch(`/api/appointments/${id}/complete`)
      .set("Authorization", `Bearer ${tokens.owner(owner.unitOwnerId)}`).send({});
    expect(forbidden.status).toBe(403);
    await request(app).patch(`/api/appointments/${id}/complete`).set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Passed" });
    const again = await request(app).patch(`/api/appointments/${id}/complete`).set("Authorization", `Bearer ${tokens.officer()}`).send({ outcome: "Passed" });
    expect(again.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run — verify fail**
```bash
npx vitest run tests/appointments.test.js -t "lifecycle"
```
Expected: FAIL (routes absent).

- [ ] **Step 3: Add service functions**

Append to `server/src/services/appointmentService.js`. Add `isValidStatus` to the shared import and use a loader:
```js
// add to the shared import: isValidStatus
async function loadAppt(id) {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw new NotFoundError("Appointment not found");
  return appt;
}
async function txnOf(appt) {
  const txn = await prisma.leasingTransaction.findUnique({ where: { id: appt.transactionId } });
  if (!txn) throw new NotFoundError("Transaction not found");
  return txn;
}

export async function reschedule(user, id, body) {
  const appt = await loadAppt(id);
  if (["Completed", "Cancelled"].includes(appt.status)) throw new ConflictError("This appointment is closed");
  const txn = await txnOf(appt);
  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: "Rescheduled", scheduledAt: new Date(body.scheduledAt), location: body.location ?? appt.location, notes: body.notes ?? appt.notes, rescheduleCount: { increment: 1 } },
  });
  await syncStageStatus(txn, appt.stage, "Scheduled");
  await logEvent(txn.id, user, `${stageByKey(appt.stage).label} rescheduled to ${new Date(body.scheduledAt).toISOString()}`, appt.stage);
  return updated;
}
export async function complete(user, id, body) {
  const appt = await loadAppt(id);
  if (appt.status === "Completed") throw new ConflictError("Already completed");
  if (appt.status === "Cancelled") throw new ConflictError("This appointment was cancelled");
  const cfg = SCHEDULABLE_STAGES[appt.stage];
  const outcome = body.outcome || cfg.defaultOutcome;
  if (!isValidStatus(appt.stage, outcome)) throw new InvalidReferenceError(`"${outcome}" is not a valid result for this stage`);
  const txn = await txnOf(appt);
  const updated = await prisma.appointment.update({ where: { id }, data: { status: "Completed", outcome } });
  await syncStageStatus(txn, appt.stage, outcome);
  await logEvent(txn.id, user, `${stageByKey(appt.stage).label} completed — ${outcome}`, appt.stage);
  return updated;
}
export async function cancel(user, id, body) {
  const appt = await loadAppt(id);
  if (["Completed", "Cancelled"].includes(appt.status)) throw new ConflictError("This appointment is closed");
  const status = body.status || "Cancelled";
  const txn = await txnOf(appt);
  const updated = await prisma.appointment.update({ where: { id }, data: { status, reason: body.reason ?? null } });
  await syncStageStatus(txn, appt.stage, "Pending");
  await logEvent(txn.id, user, `${stageByKey(appt.stage).label} ${status.toLowerCase()}${body.reason ? ` — ${body.reason}` : ""}`, appt.stage);
  return updated;
}
```

> Note: `No-show` sets the stage back to `Pending` (same as `Cancelled`) per the spec's sync table — both mean "needs rescheduling".

- [ ] **Step 4: Controller handlers**

Add to `server/src/controllers/appointmentController.js`:
```js
import { scheduleSchema, rescheduleSchema, completeSchema, cancelSchema } from "../validation/appointment.js";
// ...
export async function reschedule(req, res, next) {
  try { res.json(await svc.reschedule(req.user, req.params.id, rescheduleSchema.parse(req.body))); } catch (e) { next(e); }
}
export async function complete(req, res, next) {
  try { res.json(await svc.complete(req.user, req.params.id, completeSchema.parse(req.body))); } catch (e) { next(e); }
}
export async function cancel(req, res, next) {
  try { res.json(await svc.cancel(req.user, req.params.id, cancelSchema.parse(req.body))); } catch (e) { next(e); }
}
```
(Replace the single `scheduleSchema` import line with the combined import above.)

- [ ] **Step 5: Routes**

Add to `server/src/routes/appointmentRoutes.js` before `export default r;`:
```js
r.patch("/:id/reschedule", requireWrite, ctrl.reschedule);
r.patch("/:id/complete", requireWrite, ctrl.complete);
r.patch("/:id/cancel", requireWrite, ctrl.cancel);
```

- [ ] **Step 6: Run — verify pass, then full server suite**
```bash
npx vitest run tests/appointments.test.js
npx vitest run
```
Expected: appointments green; full suite green.

- [ ] **Step 7: Commit**
```bash
git add server/src/services/appointmentService.js server/src/controllers/appointmentController.js server/src/routes/appointmentRoutes.js server/tests/appointments.test.js
git commit -m "feat(scheduling): reschedule/complete/cancel with stage outcome sync"
```

---

### Task 5: Client resource wrapper

**Files:**
- Modify: `client/src/lib/resource.js`
- Test: `client/tests/resource.test.js` (extend)

**Interfaces:**
- Produces: `appointments.forTransaction(txnId)`, `.mine()`, `.schedule(txnId, stage, body)`, `.reschedule(id, body)`, `.complete(id, body)`, `.cancel(id, body)`.

- [ ] **Step 1: Extend the resource test**

Open `client/tests/resource.test.js` and follow its existing mock-`api` pattern. Add a block asserting the URLs/methods:
```js
it("appointments wrapper hits the right endpoints", async () => {
  const api = mockApi(); // reuse the file's helper/style
  const { appointments } = makeResources(api); // reuse how the file builds resources
  await appointments.forTransaction("t1");
  expect(api.get).toHaveBeenCalledWith("/appointments/transaction/t1");
  await appointments.mine();
  expect(api.get).toHaveBeenCalledWith("/appointments/mine");
  await appointments.schedule("t1", "UNIT_INSPECTION", { scheduledAt: "x" });
  expect(api.post).toHaveBeenCalledWith("/appointments/transaction/t1/UNIT_INSPECTION", { scheduledAt: "x" });
  await appointments.complete("a1", { outcome: "Passed" });
  expect(api.patch).toHaveBeenCalledWith("/appointments/a1/complete", { outcome: "Passed" });
});
```
> Match the file's actual harness (how it constructs the resource object and mocks `api`). Only add this test.

- [ ] **Step 2: Run — verify fail**

Run from `client/`:
```bash
npx vitest run tests/resource.test.js -t "appointments"
```
Expected: FAIL — `appointments` undefined.

- [ ] **Step 3: Add the wrapper**

In `client/src/lib/resource.js`, add (matching the file's `api` import/style used by the other wrappers like `lessorRequirements`):
```js
export const appointments = {
  forTransaction: (txnId) => api.get(`/appointments/transaction/${txnId}`),
  mine: () => api.get("/appointments/mine"),
  schedule: (txnId, stage, body) => api.post(`/appointments/transaction/${txnId}/${stage}`, body),
  reschedule: (id, body) => api.patch(`/appointments/${id}/reschedule`, body),
  complete: (id, body) => api.patch(`/appointments/${id}/complete`, body),
  cancel: (id, body) => api.patch(`/appointments/${id}/cancel`, body),
};
```
> If the file returns wrappers from a factory rather than exporting singletons, follow that structure instead — the test in Step 1 must match whichever the file uses.

- [ ] **Step 4: Run — verify pass**
```bash
npx vitest run tests/resource.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add client/src/lib/resource.js client/tests/resource.test.js
git commit -m "feat(scheduling): client appointments resource wrapper"
```

---

### Task 6: Staff Scheduling panel on Transaction Detail

**Files:**
- Create: `client/src/components/SchedulingPanel.vue`
- Modify: `client/src/views/TransactionDetailView.vue` (render the panel; reload the transaction after actions)
- Test: `client/tests/SchedulingPanel.test.js` (new)

**Interfaces:**
- Consumes: `appointments` from `resource.js`; `SCHEDULABLE_STAGES`/`SCHEDULABLE_STAGE_KEYS` from `shared/leasingStages.js`; props `{ transaction }` (id + stage) and emits `changed` so the parent reloads.

- [ ] **Step 1: Write the failing test**

Create `client/tests/SchedulingPanel.test.js`. Study `client/tests/TransactionDetailView.test.js` / `DeliveryTracker.test.js` for the mount style. Skeleton:
```js
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({
  appointments: {
    forTransaction: vi.fn(() => Promise.resolve([])),
    schedule: vi.fn(() => Promise.resolve({ id: "a1", stage: "UNIT_INSPECTION", status: "Scheduled", scheduledAt: "2026-09-01T09:00:00.000Z" })),
    reschedule: vi.fn(), complete: vi.fn(() => Promise.resolve({})), cancel: vi.fn(),
  },
}));
import SchedulingPanel from "../src/components/SchedulingPanel.vue";
import { appointments } from "../src/lib/resource.js";

const txn = { id: "t1", stage: "UNIT_INSPECTION", status: "Pending" };

describe("SchedulingPanel", () => {
  it("shows a schedule form for the current schedulable stage and schedules", async () => {
    const w = mount(SchedulingPanel, { props: { transaction: txn } });
    await flushPromises();
    const dt = w.find('input[type="datetime-local"]');
    expect(dt.exists()).toBe(true);
    await dt.setValue("2026-09-01T09:00");
    await w.findAll("button").find((b) => /schedule/i.test(b.text())).trigger("click");
    await flushPromises();
    expect(appointments.schedule).toHaveBeenCalledWith("t1", "UNIT_INSPECTION", expect.objectContaining({ scheduledAt: expect.any(String) }));
  });

  it("renders an existing appointment with Complete showing inspection outcomes", async () => {
    appointments.forTransaction.mockResolvedValueOnce([{ id: "a1", stage: "UNIT_INSPECTION", status: "Scheduled", scheduledAt: "2026-09-01T09:00:00.000Z" }]);
    const w = mount(SchedulingPanel, { props: { transaction: txn } });
    await flushPromises();
    expect(w.text()).toContain("Scheduled");
    // outcome select present for inspection
    expect(w.find("select").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fail**
```bash
npx vitest run tests/SchedulingPanel.test.js
```
Expected: FAIL (component absent).

- [ ] **Step 3: Build the component**

Create `client/src/components/SchedulingPanel.vue`. Requirements (write idiomatic Vue matching the repo's other components — `<script setup>`, scoped styles, the app's button classes `primary`/`ghost`/`danger`, `formatDate` from `../lib/formatters.js`):
- Props: `transaction` (object with `id`, `stage`, `status`). Emits `changed`.
- On mount and after each action, call `appointments.forTransaction(transaction.id)` and keep the returned rows.
- Determine the target stage = `transaction.stage` if it is in `SCHEDULABLE_STAGE_KEYS`, else null. If null, render a muted "No visit to schedule at this stage." and nothing else.
- If no appointment exists yet for that stage: render a form — `datetime-local` (bind and convert to ISO via `new Date(value).toISOString()` on submit), a `location` text input, a `notes` textarea, and a **Schedule** button calling `appointments.schedule(transaction.id, stage, { scheduledAt, location, notes })`, then reload + emit `changed`.
- If an appointment exists: show its status badge, `formatDate(scheduledAt)`, location, notes, and actions:
  - **Reschedule** — reveals the datetime field and calls `appointments.reschedule(id, { scheduledAt, ... })`.
  - **Complete** — for `UNIT_INSPECTION`, a `<select>` of `SCHEDULABLE_STAGES.UNIT_INSPECTION.outcomeOptions`; calls `appointments.complete(id, { outcome })`. For the other stages, complete with no outcome.
  - **Cancel / No-show** — a small control (status select Cancelled/No-show + optional reason) calling `appointments.cancel(id, { status, reason })`.
  - Hide Complete/Reschedule/Cancel when status is `Completed` or `Cancelled`.
- After any successful action: reload appointments and `emit('changed')`.

- [ ] **Step 4: Wire into Transaction Detail**

In `client/src/views/TransactionDetailView.vue`, import `SchedulingPanel` and render it where the stage actions live (near `DeliveryTracker`), passing `:transaction="txn"` (use the view's transaction ref name) and `@changed="<reload fn>"` (call the view's existing transaction-reload function so the tracker reflects the synced stage). Do not otherwise change the view.

- [ ] **Step 5: Run — verify pass, then full client suite**
```bash
npx vitest run tests/SchedulingPanel.test.js
npx vitest run
```
Expected: panel green; full client suite green.

- [ ] **Step 6: Commit**
```bash
git add client/src/components/SchedulingPanel.vue client/src/views/TransactionDetailView.vue client/tests/SchedulingPanel.test.js
git commit -m "feat(scheduling): staff Scheduling panel on Transaction Detail"
```

---

### Task 7: Portal upcoming-appointment card

**Files:**
- Create: `client/src/components/UpcomingAppointment.vue`
- Modify: the lessee and lessor portal views that already show "my transactions" (find them — likely `client/src/views/Portal... `/ `MyUnitsView.vue` area; place the card where a party lands after login)
- Test: `client/tests/UpcomingAppointment.test.js` (new)

**Interfaces:**
- Consumes: `appointments.mine()`; `stageByKey` from `shared/leasingStages.js` for the stage label.

- [ ] **Step 1: Write the failing test**

Create `client/tests/UpcomingAppointment.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({
  appointments: { mine: vi.fn(() => Promise.resolve([
    { id: "a1", stage: "UNIT_INSPECTION", status: "Scheduled", scheduledAt: "2026-09-01T09:00:00.000Z", location: "Tower A", notes: "Bring IDs", transaction: { reference: "RBU-2026-000001" } },
  ])) },
}));
import UpcomingAppointment from "../src/components/UpcomingAppointment.vue";

describe("UpcomingAppointment", () => {
  it("renders a scheduled appointment", async () => {
    const w = mount(UpcomingAppointment);
    await flushPromises();
    expect(w.text()).toContain("Unit Inspection");
    expect(w.text()).toContain("Tower A");
    expect(w.text()).toContain("Scheduled");
  });
  it("shows an empty state when there are none", async () => {
    const { appointments } = await import("../src/lib/resource.js");
    appointments.mine.mockResolvedValueOnce([]);
    const w = mount(UpcomingAppointment);
    await flushPromises();
    expect(w.text()).toMatch(/no upcoming|nothing scheduled/i);
  });
});
```

- [ ] **Step 2: Run — verify fail**
```bash
npx vitest run tests/UpcomingAppointment.test.js
```
Expected: FAIL (component absent).

- [ ] **Step 3: Build the component**

Create `client/src/components/UpcomingAppointment.vue` (`<script setup>`, scoped styles, `formatDate`, status badge styles like `InfoSheetsStaff.vue`):
- On mount, `appointments.mine()`; keep rows whose status is `Scheduled` or `Rescheduled` (upcoming), sorted by `scheduledAt`.
- Render each: `stageByKey(row.stage).label`, `formatDate(scheduledAt)`, `location`, `notes`, a status badge, and the transaction `reference` if present.
- Empty state: "No upcoming appointments."

- [ ] **Step 4: Place the card in the portal**

Add `<UpcomingAppointment />` to the lessee and lessor portal landing views (the "My Units" / portal home the party sees). Find the correct view(s) by searching for where `listMine`/"my" transactions or units render for `UNIT_OWNER`/`TENANT`; place the card at the top of that view. Keep it additive.

- [ ] **Step 5: Run — verify pass, then full client suite**
```bash
npx vitest run tests/UpcomingAppointment.test.js
npx vitest run
```
Expected: green; full client suite green.

- [ ] **Step 6: Commit**
```bash
git add client/src/components/UpcomingAppointment.vue client/tests/UpcomingAppointment.test.js client/src/views
git commit -m "feat(scheduling): portal upcoming-appointment card"
```

---

## Self-Review

**Spec coverage:**
- Shared schedulable config → Task 1. ✓
- Appointment model + additive migration → Task 2. ✓
- schedule + list + scoping + validation + mount → Task 3. ✓
- reschedule/complete/cancel + outcome/stage sync → Task 4. ✓
- resource wrapper → Task 5. ✓
- staff panel (Transaction Detail) → Task 6. ✓
- portal card → Task 7. ✓
- Error handling: non-schedulable stage 400, invalid scheduledAt 400, invalid outcome 400, closed appointment 409, non-staff write 403, cross-party read 404 → covered in Task 3/4 tests. ✓
- Auto-sync table (Schedule/Reschedule→Scheduled, Complete→outcome, Cancel/No-show→Pending) → `syncStageStatus` calls in Task 3/4. ✓

**Type consistency:** `syncStageStatus`, `logEvent`, `resolveName` defined in Task 3 and reused in Task 4. `scheduleSchema/rescheduleSchema/completeSchema/cancelSchema` defined in Task 3's validation file, imported in Task 4's controller. `appointments` wrapper methods (Task 5) match the routes from Tasks 3-4. Outcome validation uses `isValidStatus(stage, outcome)` — the same validator the stage engine uses.

**Known adaptation points flagged inline:** the transaction seed helper (Task 3, match `leasingTransactions.test.js`), the resource-file structure (Task 5), the Transaction Detail reload hook (Task 6), and the portal landing views (Task 7) must be matched to the real files — each step says so.

**Migration caveat:** like sub-project G, the table is applied via idempotent SQL rather than a `prisma migrate` file, because the local migration history is diverged. Deploys must run the SQL per environment until the history is reconciled (tracked separately).
