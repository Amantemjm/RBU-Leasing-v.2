# Lessor Onboarding Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approving a unit opens its leasing transaction, so a lessor-registered unit enters the pipeline and its photoshoot can be scheduled; publishing is then gated on the lessor's requirements being approved and the shoot being completed.

**Architecture:** Two service changes and one registry change. `approveUnit` calls a new `ensureForUnit` — a sibling of the existing `ensureForInquiry` — which mints an onboarding transaction linked to the unit and its lessor, starting at Send Requirements with Inquiry skipped. `publish` gains two checks that mirror the existing lessor acceptance-form guard. Separately, Key Turnover is removed from the shared stage registry, taking the pipeline from seven stages to six; everything downstream is derived from that registry, so the fallout is assertions and one icon-map entry.

**Tech Stack:** Node 20 + Express 5, Prisma 6.19 + PostgreSQL, Vue 3 `<script setup>`, Vitest with supertest on the server and @vue/test-utils + happy-dom on the client.

**Spec:** `docs/superpowers/specs/2026-09-08-lessor-onboarding-pipeline-design.md`

## Global Constraints

- **TDD is mandatory.** Write the test, run it, watch it fail for the right reason, then implement. A test that passes before the implementation exists is broken, not finished.
- **Migrations are idempotent SQL** in `server/prisma/manual-migrations/`, never `prisma migrate`. The committed Prisma history has drifted from the deployed databases.
- **`prisma generate` fails with EPERM while the API is running.** No schema change is needed in this plan, so you should not need it — if you do, stop the `rbuleasing.exe` service first (it needs UAC elevation).
- **The API has no watch mode.** Restart it manually after server changes or the next request hits old code.
- **Never hardcode a stage list.** Derive from `STAGE_KEYS` / `LEASING_STAGES`. Removing a stage must not require touching anything that already derives.
- **Mixed CRLF/LF line endings** — surgical edits only, no scripted regex rewrites of whole files.
- **Commit hygiene:** stage by explicit file path. Never `git add -A`, `git add .`, or `git add <directory>`. Run `git diff --cached --stat` before committing and confirm every file is intended.
- Run server tests from `server/`, client tests from `client/`, both via `npm test`.

---

### Task 1: Remove Key Turnover from the pipeline

The stage registry is a single shared list — there is no per-flow variant — so dropping Key Turnover from the lessor flow drops it from the system. Six stages remain. Everything except an icon map derives from the registry, so the work is mostly correcting assertions that named the stage directly.

Live data was checked before this was decided: **no transaction is at Key Turnover**, so nothing is stranded. One completed transaction carries a stale `stageData.KEY_TURNOVER` key, which renders as nothing because the tracker iterates `LEASING_STAGES`. One orphaned `Appointment` row exists, which this task deletes.

**Files:**
- Modify: `shared/leasingStages.js`
- Modify: `server/tests/leasingStages.test.js`
- Modify: `server/tests/appointments.test.js`
- Modify: `server/tests/leasingTransactions.test.js`
- Modify: `server/tests/contractSigning.test.js`
- Modify: `client/tests/DeliveryTracker.test.js`
- Modify: `client/src/components/DeliveryTracker.vue`
- Modify: `client/src/components/SchedulingPanel.vue`
- Modify: `client/src/components/UpcomingAppointment.vue`
- Create: `server/prisma/manual-migrations/2026-09-08-remove-key-turnover.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `STAGE_KEYS` becomes `["INQUIRY","SEND_REQUIREMENTS","APPROVAL","UNIT_INSPECTION","PHOTOSHOOT","CONTRACT_SIGNING"]`. `SCHEDULABLE_STAGE_KEYS` becomes `["UNIT_INSPECTION","PHOTOSHOOT"]`. `nextStageKey("UNIT_INSPECTION") === "PHOTOSHOOT"`.

- [ ] **Step 1: Write the failing registry tests**

In `server/tests/leasingStages.test.js`, replace the stage-list assertion at line 13 and the two `SCHEDULABLE_STAGE_KEYS` assertions (lines 30 and 51) and delete the `stageByKey("KEY_TURNOVER")` assertion at line 40. The resulting assertions:

```js
    expect(STAGE_KEYS).toEqual([
      "INQUIRY", "SEND_REQUIREMENTS", "APPROVAL",
      "UNIT_INSPECTION", "PHOTOSHOOT", "CONTRACT_SIGNING",
    ]);
```

```js
    expect(SCHEDULABLE_STAGE_KEYS).toEqual(["UNIT_INSPECTION", "PHOTOSHOOT"]);
```

Then add these two, which pin the behaviour the removal must produce:

```js
  it("no longer knows about Key Turnover", () => {
    expect(STAGE_KEYS).not.toContain("KEY_TURNOVER");
    expect(stageByKey("KEY_TURNOVER")).toBeUndefined();
    expect(isSchedulableStage("KEY_TURNOVER")).toBe(false);
  });

  it("runs Unit Inspection straight into Photoshoot", () => {
    expect(nextStageKey("UNIT_INSPECTION")).toBe("PHOTOSHOOT");
    expect(prevStageKey("PHOTOSHOOT")).toBe("UNIT_INSPECTION");
  });
```

Make sure `prevStageKey` and `isSchedulableStage` are in that file's import list; add them if not.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/leasingStages.test.js
```

Expected: FAIL. `STAGE_KEYS` still has 7 entries including `KEY_TURNOVER`; `nextStageKey("UNIT_INSPECTION")` returns `"KEY_TURNOVER"`.

- [ ] **Step 3: Remove the stage from the registry**

In `shared/leasingStages.js`, delete this entire object from `LEASING_STAGES` (it sits between `UNIT_INSPECTION` and `PHOTOSHOOT`):

```js
  {
    key: "KEY_TURNOVER", label: "Key Turnover", short: "Turnover",
    statuses: ["Pending", "Scheduled", "Completed", "Rescheduled"],
    initial: "Pending", done: "Completed",
    lesseeAction: "Turn over the unit keys.",
  },
```

Then delete this line from `SCHEDULABLE_STAGES`:

```js
  KEY_TURNOVER:    { defaultOutcome: "Completed" },
```

Nothing else in that file changes — `STAGE_KEYS`, `FINAL_STATUSES`, `isFinalStage`, `nextStageKey`, `prevStageKey` and `SCHEDULABLE_STAGE_KEYS` are all derived.

- [ ] **Step 4: Run the registry tests to verify they pass**

```bash
cd server && npx vitest run tests/leasingStages.test.js
```

Expected: PASS.

- [ ] **Step 5: Repair the tests that named the stage directly**

Run the full server suite to see the fallout:

```bash
cd server && npm test
```

Fix each, in these exact places:

**`server/tests/appointments.test.js`** — nine references. This file tests appointment behaviour generically using Key Turnover as its example stage. Retarget every one of them to `PHOTOSHOOT`, which is still schedulable and behaves identically (`defaultOutcome: "Completed"`, no `outcomeOptions`): replace `KEY_TURNOVER` with `PHOTOSHOOT` at lines 105, 108, 111, 123, 126, 154, 157, 158 and 159. Then add one test proving the stage is gone:

```js
  it("refuses to schedule a stage that no longer exists", async () => {
    const t = await prisma.leasingTransaction.create({ data: {
      reference: "RBU-2026-000011", stage: "UNIT_INSPECTION", status: "Pending",
      stageData: { UNIT_INSPECTION: { status: "Pending" } },
    } });
    const res = await request(app).post(`/api/appointments/transaction/${t.id}/KEY_TURNOVER`)
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ scheduledAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not a schedulable stage");
  });
```

**`server/tests/leasingTransactions.test.js`** — lines 92-93 advance twice to cross Key Turnover. Delete one `adv()` call and correct the comment so it reads:

```js
    await adv(); // UNIT_INSPECTION -> PHOTOSHOOT
```

**`server/tests/contractSigning.test.js`** — line 147 starts a transaction at `KEY_TURNOVER` to prove other stage transitions are ungated. Change that `startStage` to `"UNIT_INSPECTION"`, and update the assertion below it so the expected destination is `"PHOTOSHOOT"`.

Do NOT weaken or delete any assertion to make the suite green. Each of these is a stale reference to a stage that no longer exists, not a behaviour change.

- [ ] **Step 6: Repair the client**

`client/src/components/DeliveryTracker.vue:20` — remove the `KEY_TURNOVER: "🔑",` entry from `STAGE_ICON` so the map matches the registry:

```js
const STAGE_ICON = {
  INQUIRY: "📝", SEND_REQUIREMENTS: "📎", APPROVAL: "✅",
  UNIT_INSPECTION: "🔍", PHOTOSHOOT: "📸", CONTRACT_SIGNING: "✍️",
};
```

`client/tests/DeliveryTracker.test.js:24` — change `currentStage: "KEY_TURNOVER"` to `currentStage: "UNIT_INSPECTION"`. Then run the file and correct every milestone-count assertion from 7 to 6:

```bash
cd client && npx vitest run tests/DeliveryTracker.test.js
```

Two comments mention the stage and are now wrong — correct the wording only:
- `client/src/components/SchedulingPanel.vue:3` — "(Unit Inspection, Key Turnover, Photoshoot)" becomes "(Unit Inspection, Photoshoot)"
- `client/src/components/UpcomingAppointment.vue:3` — same correction

- [ ] **Step 7: Write the migration that clears orphaned appointments**

Create `server/prisma/manual-migrations/2026-09-08-remove-key-turnover.sql`:

```sql
-- Key Turnover has been removed from the pipeline. Its Appointment rows would
-- otherwise surface in a transaction's appointment list with no stage left to
-- label them, since listForTransaction returns every appointment regardless of
-- stage. Idempotent: a second run finds nothing to delete.
--
-- Stale stageData.KEY_TURNOVER keys on completed transactions are deliberately
-- left alone. The tracker iterates LEASING_STAGES, so an unknown key renders
-- nothing, and rewriting JSON on live rows is more risk than the tidiness is
-- worth.
DO $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM "Appointment" WHERE "stage" = 'KEY_TURNOVER';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed % Key Turnover appointment(s)', removed;
END $$;
```

- [ ] **Step 8: Apply the migration to both databases**

```bash
cd server && npx prisma db execute --file prisma/manual-migrations/2026-09-08-remove-key-turnover.sql --schema prisma/schema.prisma
```

```bash
cd server && DATABASE_URL="$(grep '^DATABASE_URL=' .env.test | cut -d= -f2- | tr -d '"')" npx prisma db execute --file prisma/manual-migrations/2026-09-08-remove-key-turnover.sql --schema prisma/schema.prisma
```

Verify rather than trusting the success message:

```bash
cd server && node -e "
require('dotenv').config({path:'.env'});
const {PrismaClient}=require('@prisma/client');
(async()=>{const p=new PrismaClient();
console.log('Key Turnover appointments remaining:', await p.appointment.count({where:{stage:'KEY_TURNOVER'}}));
await p.\$disconnect();})()"
```

Expected: `0`.

- [ ] **Step 9: Run both suites**

```bash
cd server && npm test
```

```bash
cd client && npx vitest run && npm run build
```

Expected: both PASS, build clean.

- [ ] **Step 10: Commit**

```bash
git add shared/leasingStages.js server/tests/leasingStages.test.js server/tests/appointments.test.js server/tests/leasingTransactions.test.js server/tests/contractSigning.test.js client/tests/DeliveryTracker.test.js client/src/components/DeliveryTracker.vue client/src/components/SchedulingPanel.vue client/src/components/UpcomingAppointment.vue server/prisma/manual-migrations/2026-09-08-remove-key-turnover.sql
git commit -m "feat(stages): remove Key Turnover, six stages remain

Not part of the lessor flow, and the registry is a single shared list, so
it goes from the system. Unit Inspection now runs straight into Photoshoot.

No transaction was at Key Turnover, so nothing is stranded. Orphaned
appointment rows are deleted by migration; stale stageData keys are left
alone because the tracker iterates the registry and renders nothing for them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `ensureForUnit` — the onboarding transaction

A sibling of `ensureForInquiry` in the same file, with the same idempotent contract. This task only adds the function; Task 3 wires it to approval.

**Files:**
- Modify: `server/src/services/leasingTransactionService.js`
- Test: `server/tests/unitOnboarding.test.js` (create)

**Interfaces:**
- Consumes: the six-stage registry from Task 1.
- Produces: `openTransactionForUnit(unitId)` → the unit's most recent transaction whose `finalStatus` is neither `"Signed"` nor `"Declined"`, or `null`. `ensureForUnit(unit, actor)` → the existing open transaction, or a newly created one. `unit` must carry `id`, `unitNumber` and `ownerId`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/unitOnboarding.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, factory } from "./helpers.js";
import { ensureForUnit, openTransactionForUnit } from "../src/services/leasingTransactionService.js";

// A lessor bringing a unit to market gets a transaction of their own — there is
// no lessee yet, and no inquiry to hang it off.
beforeEach(async () => { await resetCrudTables(); });

async function ownedUnit(over = {}) {
  const owner = await factory.owner({ name: "Maria Santos", ...(over.owner || {}) });
  const unit = await prisma.unit.create({
    data: { ownerId: owner.id, unitNumber: over.unitNumber || "19A", baseRent: 0, approvalStatus: "APPROVED" },
  });
  return { owner, unit };
}

describe("ensureForUnit", () => {
  it("opens a transaction resting at Send Requirements", async () => {
    const { unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: "officer-1", role: "LEASING_OFFICER" });
    expect(txn.reference).toMatch(/^RBU-\d{4}-\d{6}$/);
    expect(txn.stage).toBe("SEND_REQUIREMENTS");
    expect(txn.status).toBe("Pending");
  });

  it("marks Inquiry skipped rather than pretending one happened", async () => {
    const { unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: "officer-1" });
    expect(txn.stageData.INQUIRY.status).toBe("Skipped");
    expect(txn.stageData.INQUIRY.completedAt).toBeTruthy();
    expect(txn.inquiryId).toBeNull();
  });

  it("links the unit and its lessor, and carries no lessee", async () => {
    const { owner, unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: "officer-1" });
    expect(txn.unitId).toBe(unit.id);
    expect(txn.unitOwnerId).toBe(owner.id);
    expect(txn.tenantId).toBeNull();
    expect(txn.lesseeName).toBeNull();
  });

  it("takes the officer from the owner's assignment", async () => {
    const officer = await prisma.user.create({
      data: { name: "Ramon Cruz", email: "cruz@x.com", passwordHash: "x", role: "LEASING_OFFICER" },
    });
    const owner = await factory.owner({ name: "Assigned Owner", assignedOfficerId: officer.id });
    const unit = await prisma.unit.create({ data: { ownerId: owner.id, unitNumber: "31B", baseRent: 0 } });
    const txn = await ensureForUnit(unit, { userId: "someone-else" });
    expect(txn.assignedOfficerId).toBe(officer.id);
  });

  it("falls back to whoever approved it when the owner has no officer", async () => {
    const approver = await prisma.user.create({
      data: { name: "Elena Reyes", email: "reyes@x.com", passwordHash: "x", role: "LEASING_OFFICER" },
    });
    const { unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: approver.id });
    expect(txn.assignedOfficerId).toBe(approver.id);
  });

  it("is idempotent — a second call returns the same transaction", async () => {
    const { unit } = await ownedUnit();
    const first = await ensureForUnit(unit, { userId: "officer-1" });
    const second = await ensureForUnit(unit, { userId: "officer-1" });
    expect(second.id).toBe(first.id);
    expect(await prisma.leasingTransaction.count({ where: { unitId: unit.id } })).toBe(1);
  });

  it("opens a fresh one once the previous deal has closed", async () => {
    const { unit } = await ownedUnit();
    const first = await ensureForUnit(unit, { userId: "officer-1" });
    await prisma.leasingTransaction.update({
      where: { id: first.id }, data: { stage: "CONTRACT_SIGNING", status: "Signed", finalStatus: "Signed" },
    });
    const second = await ensureForUnit(unit, { userId: "officer-1" });
    expect(second.id).not.toBe(first.id);
  });

  it("logs an event naming the unit", async () => {
    const { unit } = await ownedUnit({ unitNumber: "07C" });
    const txn = await ensureForUnit(unit, { userId: "officer-1" });
    const events = await prisma.transactionEvent.findMany({ where: { transactionId: txn.id } });
    expect(events.some((e) => e.message.includes("07C"))).toBe(true);
  });
});

describe("openTransactionForUnit", () => {
  it("returns null for a unit that has never been through the pipeline", async () => {
    const { unit } = await ownedUnit();
    expect(await openTransactionForUnit(unit.id)).toBeNull();
  });

  it("ignores a transaction that closed as Declined", async () => {
    const { unit } = await ownedUnit();
    const t = await ensureForUnit(unit, { userId: "officer-1" });
    await prisma.leasingTransaction.update({
      where: { id: t.id }, data: { stage: "CONTRACT_SIGNING", status: "Declined", finalStatus: "Declined" },
    });
    expect(await openTransactionForUnit(unit.id)).toBeNull();
  });

  it("returns a transaction still mid-pipeline", async () => {
    const { unit } = await ownedUnit();
    const t = await ensureForUnit(unit, { userId: "officer-1" });
    expect((await openTransactionForUnit(unit.id)).id).toBe(t.id);
  });
});
```

Check `server/tests/helpers.js` for `factory.owner` — if it does not accept `assignedOfficerId`, pass it through; the factory spreads its overrides, so it should already work.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/unitOnboarding.test.js
```

Expected: FAIL — `ensureForUnit is not a function`.

- [ ] **Step 3: Implement both functions**

In `server/src/services/leasingTransactionService.js`, add these directly below `ensureForInquiry` so the two sit together:

```js
// The unit's current transaction, or null. "Closed" is only ever written at
// Contract Signing, so anything earlier in the pipeline counts as open.
export async function openTransactionForUnit(unitId) {
  return prisma.leasingTransaction.findFirst({
    where: { unitId, OR: [{ finalStatus: null }, { finalStatus: { notIn: ["Signed", "Declined"] } }] },
    orderBy: { createdAt: "desc" },
  });
}

// Opens the onboarding transaction for a unit the lessor has registered
// (idempotent). There is no inquiry and no lessee — this is the lessor
// bringing a unit to market, so Inquiry is marked Skipped rather than
// pretending one happened, and the flow rests at Send Requirements.
export async function ensureForUnit(unit, actor) {
  const existing = await openTransactionForUnit(unit.id);
  if (existing) return existing;

  // The owner's officer owns the relationship; the approver is the fallback.
  const owner = await prisma.unitOwner.findUnique({
    where: { id: unit.ownerId }, select: { assignedOfficerId: true },
  });

  const now = stampNow();
  const reference = await nextReference();
  const stageData = {
    INQUIRY: { status: "Skipped", completedAt: now },
    SEND_REQUIREMENTS: { status: "Pending", startedAt: now },
  };
  const txn = await prisma.leasingTransaction.create({
    data: {
      reference,
      stage: "SEND_REQUIREMENTS",
      status: "Pending",
      stageData,
      unitId: unit.id,
      unitOwnerId: unit.ownerId,
      assignedOfficerId: owner?.assignedOfficerId || actor?.userId || null,
    },
  });
  await logEvent(txn.id, actor,
    `Unit ${unit.unitNumber} approved — onboarding transaction ${reference} opened`,
    "SEND_REQUIREMENTS");
  return txn;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/unitOnboarding.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/leasingTransactionService.js server/tests/unitOnboarding.test.js
git commit -m "feat(leasing): ensureForUnit opens a lessor's onboarding transaction

Sibling of ensureForInquiry: idempotent, rests at Send Requirements with
Inquiry marked Skipped, links the unit and its lessor, and carries no lessee
because there is not one yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Unit approval opens the transaction

**Files:**
- Modify: `server/src/services/unitService.js`
- Modify: `server/src/controllers/unitController.js:29-31`
- Test: `server/tests/unitOnboarding.test.js`

**Interfaces:**
- Consumes: `ensureForUnit(unit, actor)` from Task 2.
- Produces: `approveUnit(id, actor)` — **second parameter added**, optional so existing callers keep working.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/unitOnboarding.test.js`:

```js
import request from "supertest";
import { createApp } from "../src/app.js";
import { tokens } from "./helpers.js";

const app = createApp();

describe("Approving a unit opens its pipeline", () => {
  async function submittedUnit() {
    const owner = await factory.owner({ name: "Benjamin Tan" });
    return prisma.unit.create({
      data: { ownerId: owner.id, unitNumber: "23F", baseRent: 0, approvalStatus: "SUBMITTED" },
    });
  }

  it("opens a transaction when an officer approves", async () => {
    const unit = await submittedUnit();
    const res = await request(app).patch(`/api/units/${unit.id}/approve`)
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    const txn = await openTransactionForUnit(unit.id);
    expect(txn).not.toBeNull();
    expect(txn.stage).toBe("SEND_REQUIREMENTS");
    expect(txn.unitOwnerId).toBe(unit.ownerId);
  });

  it("does not open a second one when a rejected unit is re-approved", async () => {
    const unit = await submittedUnit();
    const t = tokens.officer();
    await request(app).patch(`/api/units/${unit.id}/approve`).set("Authorization", `Bearer ${t}`);
    // Reject is only valid from SUBMITTED, so put it back there first.
    await prisma.unit.update({ where: { id: unit.id }, data: { approvalStatus: "SUBMITTED" } });
    await request(app).patch(`/api/units/${unit.id}/reject`).set("Authorization", `Bearer ${t}`)
      .send({ remarks: "Wrong floor plan" });
    await request(app).patch(`/api/units/${unit.id}/submit`).set("Authorization", `Bearer ${t}`);
    await request(app).patch(`/api/units/${unit.id}/approve`).set("Authorization", `Bearer ${t}`);
    expect(await prisma.leasingTransaction.count({ where: { unitId: unit.id } })).toBe(1);
  });

  it("leaves a draft or rejected unit alone", async () => {
    const owner = await factory.owner({ name: "Draft Owner" });
    const unit = await prisma.unit.create({
      data: { ownerId: owner.id, unitNumber: "07C", baseRent: 0, approvalStatus: "DRAFT" },
    });
    const res = await request(app).patch(`/api/units/${unit.id}/approve`)
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(409);
    expect(await openTransactionForUnit(unit.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/unitOnboarding.test.js -t "Approving a unit"
```

Expected: FAIL — `openTransactionForUnit` returns `null` after approval, because nothing calls `ensureForUnit` yet.

- [ ] **Step 3: Call `ensureForUnit` from `approveUnit`**

In `server/src/services/unitService.js`, add the import at the top:

```js
import { ensureForUnit } from "./leasingTransactionService.js";
```

Then replace `approveUnit`:

```js
export async function approveUnit(id, actor) {
  const unit = await getUnit(id);
  if (unit.approvalStatus !== "SUBMITTED") {
    throw new ConflictError("Only a submitted unit can be approved");
  }
  const approved = await prisma.unit.update({
    where: { id }, data: { approvalStatus: "APPROVED", reviewRemarks: null }, include: withHierarchy,
  });
  // Approval is what puts the unit into the pipeline — this is where its
  // photoshoot becomes schedulable. Never let a failure here undo the
  // approval: a unit approved without a transaction is recoverable, a
  // half-applied approval is not.
  try {
    await ensureForUnit(approved, actor);
  } catch (e) {
    console.error(`Unit ${approved.unitNumber} approved but its transaction could not be opened:`, e.message);
  }
  return approved;
}
```

- [ ] **Step 4: Pass the actor through the controller**

In `server/src/controllers/unitController.js`, replace `approve` (line 29-31):

```js
export async function approve(req, res, next) {
  try { res.json(await service.approveUnit(req.params.id, req.user)); } catch (e) { next(e); }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/unitOnboarding.test.js
```

Expected: PASS.

- [ ] **Step 6: Run the full server suite**

```bash
cd server && npm test
```

Expected: PASS. Tests that approve units now also create transactions — if a test asserts a transaction count, update it to the new reality rather than removing the call.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/unitService.js server/src/controllers/unitController.js server/tests/unitOnboarding.test.js
git commit -m "feat(units): approving a unit opens its onboarding transaction

This is what gives a lessor-registered unit somewhere to schedule its
photoshoot. A failure opening the transaction is logged, never allowed to
undo the approval.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Gate publishing on the process

**Files:**
- Modify: `server/src/services/unitListingService.js`
- Test: `server/tests/unitListingPublishGate.test.js` (create)

**Interfaces:**
- Consumes: `ensureForUnit` from Task 2; `listForOwner(unitOwnerId)` from `lessorRequirementService`.
- Produces: `publish(user, unitId)` — unchanged signature, four refusals now. `publishReadiness(unit)` → `{ approved, requirementsApproved, requirementsTotal, photoshootCompleted, photoCount }`, exported and included on the `getForUnit` payload as `readiness`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/unitListingPublishGate.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, factory } from "./helpers.js";
import { publish } from "../src/services/unitListingService.js";
import { ensureForUnit } from "../src/services/leasingTransactionService.js";
import { LESSOR_REQUIREMENT_TYPES } from "../../shared/lessorRequirements.js";

// Publishing is the end of the lessor onboarding chain, not a button an officer
// can press at any point: the paperwork must be approved and the shoot done.
beforeEach(async () => {
  await prisma.lessorRequirement.deleteMany();
  await resetCrudTables();
});

const staff = { userId: "officer-1", role: "LEASING_OFFICER" };

async function approvedUnit() {
  const owner = await factory.owner({ name: "Maria Santos" });
  const unit = await prisma.unit.create({
    data: { ownerId: owner.id, unitNumber: "19A", baseRent: 0, approvalStatus: "APPROVED" },
  });
  return { owner, unit };
}
async function approveAllRequirements(unitOwnerId) {
  for (const t of LESSOR_REQUIREMENT_TYPES) {
    await prisma.lessorRequirement.create({
      data: { unitOwnerId, requirementKey: t.key, status: "Approved" },
    });
  }
}
async function completePhotoshoot(unitId) {
  const txn = await prisma.leasingTransaction.findFirst({ where: { unitId } });
  await prisma.appointment.create({
    data: { transactionId: txn.id, stage: "PHOTOSHOOT", status: "Completed",
            outcome: "Completed", scheduledAt: new Date() },
  });
}
const addPhoto = (unitId) => prisma.unitPhoto.create({
  data: { unitId, data: Buffer.from("x"), mimeType: "image/png", size: 1 },
});

describe("Publish gate", () => {
  it("refuses a unit that is not approved", async () => {
    const { owner } = await approvedUnit();
    const draft = await prisma.unit.create({
      data: { ownerId: owner.id, unitNumber: "07C", baseRent: 0, approvalStatus: "DRAFT" },
    });
    await expect(publish(staff, draft.id)).rejects.toThrow(/Only an approved unit/);
  });

  it("refuses while the lessor's requirements are outstanding, and says how many", async () => {
    const { unit } = await approvedUnit();
    await ensureForUnit(unit, staff);
    await expect(publish(staff, unit.id)).rejects.toThrow(/requirements must be approved first \(0\/7\)/);
  });

  it("refuses when the photoshoot has not been completed", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await ensureForUnit(unit, staff);
    await expect(publish(staff, unit.id)).rejects.toThrow(/photoshoot has not been completed/);
  });

  it("refuses a unit that never entered the pipeline", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await expect(publish(staff, unit.id)).rejects.toThrow(/photoshoot has not been completed/);
  });

  it("still refuses without a photo once everything else is satisfied", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await ensureForUnit(unit, staff);
    await completePhotoshoot(unit.id);
    await expect(publish(staff, unit.id)).rejects.toThrow(/Add at least one photo/);
  });

  it("publishes once every step is satisfied", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await ensureForUnit(unit, staff);
    await completePhotoshoot(unit.id);
    await addPhoto(unit.id);
    const listing = await publish(staff, unit.id);
    expect(listing.published).toBe(true);
  });

  it("reports the earliest unmet step first", async () => {
    // Nothing done at all — the requirements refusal must win over the
    // photoshoot one, so the officer works the process in order.
    const { unit } = await approvedUnit();
    await expect(publish(staff, unit.id)).rejects.toThrow(/requirements must be approved first/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/unitListingPublishGate.test.js
```

Expected: FAIL — publishing currently succeeds as soon as a photo exists, so the requirements and photoshoot refusals never fire.

- [ ] **Step 3: Add the two checks**

In `server/src/services/unitListingService.js`, add the import beside the existing ones:

```js
import { listForOwner } from "./lessorRequirementService.js";
```

Add one readiness computation. The publish gate and the listing page both use
it, so the UI can never disagree with the server about why publishing refuses:

```js
// Everything that has to be true before a unit can go on the market. Exported
// because getForUnit hands it to the listing page, which lists the unmet steps.
export async function publishReadiness(unit) {
  // listForOwner completes the checklist from the shared config, so an
  // untouched document type counts as outstanding rather than missing.
  const reqs = await listForOwner(unit.ownerId);
  // Asking the appointment answers "did the shoot happen", where stageData
  // only answers "is the marker set".
  const shoot = await prisma.appointment.findFirst({
    where: { stage: "PHOTOSHOOT", status: "Completed", transaction: { unitId: unit.id } },
    select: { id: true },
  });
  return {
    approved: unit.approvalStatus === "APPROVED",
    requirementsApproved: reqs.filter((r) => r.status === "Approved").length,
    requirementsTotal: reqs.length,
    photoshootCompleted: !!shoot,
    photoCount: await prisma.unitPhoto.count({ where: { unitId: unit.id } }),
  };
}
```

Then replace `publish`. The order of the refusals is the order of the process,
so the officer is always told the earliest thing still outstanding:

```js
export async function publish(user, unitId) {
  const unit = await loadUnit(unitId);
  const r = await publishReadiness(unit);
  if (!r.approved) throw new ConflictError("Only an approved unit can be published");
  if (r.requirementsApproved < r.requirementsTotal) {
    throw new ConflictError(`All lessor requirements must be approved first (${r.requirementsApproved}/${r.requirementsTotal})`);
  }
  if (!r.photoshootCompleted) throw new ConflictError("The photoshoot has not been completed");
  if (r.photoCount === 0) throw new ConflictError("Add at least one photo before publishing");

  await prisma.unitListing.upsert({
    where: { unitId },
    create: { unitId, published: true, publishedAt: new Date(), details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS },
    update: { published: true, publishedAt: new Date() },
  });
  return getForUnit(unitId);
}
```

Finally, put it on the listing payload so the page can show the same reasons.
In `getForUnit`, extend the returned object:

```js
  return { unit: unitCore(unit), listing: effective, photos, readiness: await publishReadiness(unit) };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/unitListingPublishGate.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full server suite**

```bash
cd server && npm test
```

Expected: some existing listing tests will now fail — they publish units without requirements or a shoot. Give each one the setup the process requires (approve the checklist, create a completed photoshoot appointment). Do NOT relax the gate to make them pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/unitListingService.js server/tests/unitListingPublishGate.test.js
git commit -m "feat(listings): gate publishing on requirements and the photoshoot

Publishing is the end of the lessor onboarding chain rather than a button
available at any point. Refusals name the earliest unmet step so the officer
works the process in order.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Show the officer what is outstanding

The server is the gate; this is so the officer is not guessing why Publish
refuses. It reads the `readiness` block Task 4 added to the listing payload, so
the page and the server always give the same reasons.

**Files:**
- Modify: `client/src/views/UnitListingView.vue`
- Test: `client/tests/UnitListingView.test.js` (create)

**Interfaces:**
- Consumes: `readiness` on the `unitListings.get(unitId)` payload — `{ approved, requirementsApproved, requirementsTotal, photoshootCompleted, photoCount }`, added in Task 4.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing test**

Create `client/tests/UnitListingView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The listing page names the steps still outstanding, from the same readiness
// the server gates on — so the page and the refusal cannot disagree.
vi.mock("../src/lib/resource.js", () => ({
  unitListings: {
    get: vi.fn(),
    update: vi.fn(() => Promise.resolve({})),
    publish: vi.fn(() => Promise.resolve({})),
    unpublish: vi.fn(() => Promise.resolve({})),
    staffImageUrl: (unitId, photoId) => `/api/unit-listings/${unitId}/photos/${photoId}/image`,
  },
}));
vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(() => Promise.resolve({ data: new Blob(["x"]) })) } }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "u1" } }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ["to"], template: "<a><slot /></a>" },
}));

import UnitListingView from "../src/views/UnitListingView.vue";
import { unitListings } from "../src/lib/resource.js";

const payload = (readiness) => ({
  unit: { id: "u1", unitNumber: "19A", approvalStatus: "APPROVED", ownerId: "o1" },
  listing: { unitId: "u1", published: false, headline: null, details: {}, visibleFields: [], coverPhotoId: null },
  photos: [],
  readiness,
});

async function mountWith(readiness) {
  unitListings.get.mockResolvedValue(payload(readiness));
  const w = mount(UnitListingView);
  await flushPromises();
  return w;
}

describe("UnitListingView publish readiness", () => {
  beforeEach(() => { unitListings.get.mockReset(); });

  it("lists what is still outstanding before publishing", async () => {
    const w = await mountWith({ approved: true, requirementsApproved: 4, requirementsTotal: 7, photoshootCompleted: false, photoCount: 0 });
    const text = w.find(".blockers").text();
    expect(text).toContain("4 of 7");
    expect(text).toContain("photoshoot");
    expect(text).toContain("photo");
  });

  it("drops a step once it is satisfied", async () => {
    const w = await mountWith({ approved: true, requirementsApproved: 7, requirementsTotal: 7, photoshootCompleted: false, photoCount: 3 });
    const text = w.find(".blockers").text();
    expect(text).not.toContain("of 7");
    expect(text).toContain("photoshoot");
  });

  it("shows nothing once every step is satisfied", async () => {
    const w = await mountWith({ approved: true, requirementsApproved: 7, requirementsTotal: 7, photoshootCompleted: true, photoCount: 2 });
    expect(w.find(".blockers").exists()).toBe(false);
  });

  it("says so when the unit itself is not approved yet", async () => {
    const w = await mountWith({ approved: false, requirementsApproved: 7, requirementsTotal: 7, photoshootCompleted: true, photoCount: 2 });
    expect(w.find(".blockers").text()).toContain("approved");
  });
});
```

Check this mock against the real `client/src/lib/resource.js` before running: if
`unitListings` exports names the mock omits, the view throws on import. Add any
missing ones as `vi.fn()`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd client && npx vitest run tests/UnitListingView.test.js
```

Expected: FAIL — `.blockers` does not exist.

- [ ] **Step 3: Store the readiness and derive the list**

In `client/src/views/UnitListingView.vue`, add a ref beside the existing
`listing` / `photos` refs (around line 15):

```js
const readiness = ref(null);
```

In the loader that calls `unitListings.get(unitId)` (around line 73), keep it
alongside the others:

```js
    readiness.value = res.readiness || null;
```

Then add the computed — `computed` is already imported in this file:

```js
// The same steps the server gates on, in the same order, so the page tells the
// officer what Publish would refuse before they click it.
const blockers = computed(() => {
  const r = readiness.value;
  if (!r) return [];
  const out = [];
  if (!r.approved) out.push("The unit has not been approved yet");
  if (r.requirementsApproved < r.requirementsTotal) {
    out.push(`Lessor requirements: ${r.requirementsApproved} of ${r.requirementsTotal} approved`);
  }
  if (!r.photoshootCompleted) out.push("The photoshoot has not been completed");
  if (!r.photoCount) out.push("No photos uploaded yet");
  return out;
});
```

- [ ] **Step 4: Render it above the Publish control**

```html
        <ul v-if="blockers.length" class="blockers">
          <li v-for="b in blockers" :key="b">{{ b }}</li>
        </ul>
```

Add the style, matching the blocker list already in `TransactionDetailView.vue`.
Use `var(--warn)` — `--warning` is not a token in this codebase and silently
falls back to the border colour:

```css
.blockers { list-style: none; margin: 0 0 0.6rem; padding: 0.55rem 0.7rem; display: grid; gap: 0.25rem; border: 1px solid var(--warn, var(--line-strong)); border-radius: var(--radius-sm); background: var(--surface); font-size: 0.83rem; color: var(--muted); }
.blockers li::before { content: "\2192 "; color: var(--faint); }
```

- [ ] **Step 5: Run the tests and the build**

```bash
cd client && npx vitest run && npm run build
```

Expected: PASS, build clean. The build is the only check on scoped CSS — a
dangling brace passes every test.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/UnitListingView.vue client/tests/UnitListingView.test.js
git commit -m "feat(ui): name what is blocking a listing from being published

Reads the same readiness the server gates on, so the page and the refusal
cannot disagree.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Bring the demo and simulation scripts up to date

These are how the office demo is rebuilt, and they still walk seven stages and publish units without satisfying the new gate. Left alone, `seed-demo.mjs` will fail partway.

**Files:**
- Modify: `server/scripts/seed-demo.mjs`
- Modify: `server/scripts/e2e-all-roles.mjs`
- Modify: `server/scripts/simulate.mjs`

**Interfaces:**
- Consumes: the six-stage registry, the publish gate.
- Produces: a demo database matching the new flow.

- [ ] **Step 1: Update the seed**

In `server/scripts/seed-demo.mjs`:

- Delete the Key Turnover block (the `KEY_TURNOVER` appointment schedule and its `complete` call, around line 239).
- Units are now approved *before* their listings are published, and approval opens a transaction — so the listing loop must satisfy the gate. Before each `PATCH /unit-listings/:id/publish`, the owner's requirements must be approved and a photoshoot appointment completed on that unit's transaction.
- The simplest ordering that satisfies this: approve the lessor checklists **before** the listings section, then for each unit to be published, find its transaction (`GET /leasing-transactions` and match `unitId`), schedule a `PHOTOSHOOT` appointment dated in the past, and complete it.

- [ ] **Step 2: Run the seed end to end**

```bash
cd server && node scripts/wipe-demo.mjs && node scripts/seed-demo.mjs
```

Expected: completes, and the summary still reports 4 live listings. If publishing refuses, the message names the unmet step — fix the ordering rather than loosening the gate.

- [ ] **Step 3: Update the two simulation scripts**

`server/scripts/e2e-all-roles.mjs` — remove the "5 · Key Turnover" step (around line 377) and renumber the steps after it. `server/scripts/simulate.mjs` — remove its Key Turnover step and its `walk` call, and correct the step numbering.

- [ ] **Step 4: Run both**

```bash
cd server && node scripts/verify-demo.mjs
```

Expected: all checks pass. Update any count assertion that the six-stage pipeline legitimately changes.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/seed-demo.mjs server/scripts/e2e-all-roles.mjs server/scripts/simulate.mjs
git commit -m "chore(demo): six stages, and satisfy the publish gate when seeding

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none modified.

- [ ] **Step 1: Both suites and the build**

```bash
cd server && npm test
```

```bash
cd client && npx vitest run && npm run build
```

Report the actual counts.

- [ ] **Step 2: Restart the API and walk it by hand**

The API has no watch mode, so it is still running the old code.

Restart the `rbuleasing.exe` service (needs UAC elevation). Then, signed in as an officer: approve a submitted unit and confirm a transaction appears for it; open that transaction and confirm the tracker shows **six** stages with no Key Turnover; try to publish the unit and confirm the refusal names the outstanding step.

- [ ] **Step 3: Confirm the deployment note**

Four manual migrations are now pending on the office server:

```
server/prisma/manual-migrations/2026-09-07-lessee-requirements.sql
server/prisma/manual-migrations/2026-09-07-transaction-document-types.sql
server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql
server/prisma/manual-migrations/2026-09-08-remove-key-turnover.sql
```

None fails at startup; each fails at first use.

---

## Notes for the implementer

**Existing approved units have no transaction, and this is unresolved.** Six in the seeded demo and an unknown number on the office server will fail the publish gate at the photoshoot check despite already being live. Task 6 sidesteps it for the demo by rebuilding from scratch. **The office server needs a decision before deploy** — backfill a transaction for every approved unit, exempt units approved before this ships, or accept that re-publishing one means walking it through the pipeline. Do not invent an answer; raise it.

**`ensureForInquiry` can still create a duplicate.** When an inquiry carries a `unitId` and that unit already has an open transaction, it mints a second one rather than attaching. After this plan ships every approved unit has a transaction, so that becomes the normal case rather than an edge one. The fix is small — set `inquiryId` on the existing transaction — but it edits code another author pushed on 8 Sep and belongs to the lessee side. It is tracked in the spec's Related Work and is deliberately not in this plan.
