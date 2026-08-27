# Leasing Stage Engine Reshape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared 10-stage leasing state machine with the 6-stage lessor flow — Inquiry (skippable) → Send Requirements → Approval (4-step routing) → Unit Inspection → Key Turnover → Photoshoot (terminal).

**Architecture:** Stages are defined once in `shared/leasingStages.js` and consumed by the server service (state machine) and the Vue tracker UI. The array is rewritten in place; the service's generic advance/return/approval logic is unchanged, only `ensureForInquiry` (entry point) and `createTransaction` (adds an optional `startStage`) change. The tracker is data-driven off the stage list; only its icon map and terminal check need touching. No DB migration — stages live in the JSON `stage`/`stageData` columns and the transactions/inquiries tables are empty.

**Tech Stack:** Node.js + Express, Prisma (PostgreSQL), Zod validation, Vitest + Supertest (server), Vue 3 + Vitest + @vue/test-utils (client).

## Global Constraints

- Stage config object shape stays exactly `{ key, label, short, statuses, initial, done, lesseeAction }` — the tracker reads these field names, including `lesseeAction` (its text is lessor-facing guidance; the field name is kept to avoid churn).
- Keep `APPROVAL_ROUTING = ["Leasing", "Management", "Authorized Approver", "Final Approval"]` and the `APPROVAL` stage key unchanged (the routing chain is seeded by key match).
- No Prisma schema change, no migration.
- Server tests run against the dedicated `rbu_leasing_test` database (forced by `server/tests/setup.env.js`) — they never touch dev data. Ensure that DB exists and is migrated before running: from `server/`, `DATABASE_URL="postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing_test?schema=public" npx prisma migrate deploy` (only needed once).
- Run a single server test file with: `cd server && npx vitest run tests/<file>` ; client: `cd client && npx vitest run tests/<file>`.

---

### Task 1: Reshape the stage list and terminal check

**Files:**
- Modify: `shared/leasingStages.js` (the `LEASING_STAGES` array, lines 9-70; `isFinalStage`, lines 86-88)
- Test: `server/tests/leasingStages.test.js` (create)

**Interfaces:**
- Produces: `LEASING_STAGES` (6 entries), `STAGE_KEYS = ["INQUIRY","SEND_REQUIREMENTS","APPROVAL","UNIT_INSPECTION","KEY_TURNOVER","PHOTOSHOOT"]`, `isFinalStage("PHOTOSHOOT") === true`. Helpers `stageByKey/stageIndex/nextStageKey/prevStageKey/isValidStatus` unchanged.

- [ ] **Step 1: Write the failing test**

Create `server/tests/leasingStages.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  LEASING_STAGES, STAGE_KEYS, stageByKey, isFinalStage, nextStageKey,
} from "../../shared/leasingStages.js";

describe("Leasing stage engine (lessor flow)", () => {
  it("has the six lessor stages in order", () => {
    expect(STAGE_KEYS).toEqual([
      "INQUIRY", "SEND_REQUIREMENTS", "APPROVAL",
      "UNIT_INSPECTION", "KEY_TURNOVER", "PHOTOSHOOT",
    ]);
  });

  it("marks Photoshoot as the terminal stage", () => {
    expect(isFinalStage("PHOTOSHOOT")).toBe(true);
    expect(isFinalStage("APPROVAL")).toBe(false);
    expect(nextStageKey("PHOTOSHOOT")).toBe(null);
  });

  it("exposes the done status used to advance each stage", () => {
    expect(stageByKey("INQUIRY").done).toBe("Qualified");
    expect(stageByKey("SEND_REQUIREMENTS").done).toBe("Complete");
    expect(stageByKey("APPROVAL").done).toBe("Approved");
    expect(stageByKey("UNIT_INSPECTION").done).toBe("Passed");
    expect(stageByKey("KEY_TURNOVER").done).toBe("Completed");
    expect(stageByKey("PHOTOSHOOT").done).toBe("Completed");
  });

  it("allows Inquiry to be marked Skipped", () => {
    expect(stageByKey("INQUIRY").statuses).toContain("Skipped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/leasingStages.test.js`
Expected: FAIL — current `STAGE_KEYS` still contains `ACCEPT_INQUIRY`, `UNIT_REGISTRATION`, etc.

- [ ] **Step 3: Replace the `LEASING_STAGES` array**

In `shared/leasingStages.js`, replace the entire `export const LEASING_STAGES = [ ... ];` block (lines 9-70) with:

```js
export const LEASING_STAGES = [
  {
    key: "INQUIRY", label: "Inquiry", short: "Inquiry",
    statuses: ["New Inquiry", "Under Review", "Qualified", "Not Qualified", "Declined", "Skipped"],
    initial: "New Inquiry", done: "Qualified",
    lesseeAction: "Submit your inquiry — no account needed.",
  },
  {
    key: "SEND_REQUIREMENTS", label: "Send Requirements", short: "Requirements",
    statuses: ["Pending", "Submitted", "Incomplete", "Complete"],
    initial: "Pending", done: "Complete",
    lesseeAction: "Upload the required documents.",
  },
  {
    key: "APPROVAL", label: "Approval", short: "Approval",
    statuses: ["Pending Submission", "Submitted", "Under Review", "For Revision", "Approved", "Rejected"],
    initial: "Pending Submission", done: "Approved",
    lesseeAction: "Await approval of your submission.",
  },
  {
    key: "UNIT_INSPECTION", label: "Unit Inspection", short: "Inspection",
    statuses: ["Pending", "Scheduled", "In Progress", "Passed", "Passed with Remarks", "For Rectification", "Failed", "Rescheduled"],
    initial: "Pending", done: "Passed",
    lesseeAction: "Attend or acknowledge the unit inspection.",
  },
  {
    key: "KEY_TURNOVER", label: "Key Turnover", short: "Turnover",
    statuses: ["Pending", "Scheduled", "Completed", "Rescheduled"],
    initial: "Pending", done: "Completed",
    lesseeAction: "Turn over the unit keys.",
  },
  {
    key: "PHOTOSHOOT", label: "Photoshoot", short: "Photoshoot",
    statuses: ["Pending", "Scheduled", "In Progress", "Completed", "Rescheduled"],
    initial: "Pending", done: "Completed",
    lesseeAction: "The unit photoshoot is scheduled.",
  },
];
```

- [ ] **Step 4: Point `isFinalStage` at Photoshoot**

In `shared/leasingStages.js`, change `isFinalStage`:

```js
export function isFinalStage(key) {
  return key === "PHOTOSHOOT";
}
```

(Leave `APPROVAL_ROUTING`, `APPROVAL_STEP_STATUSES`, `STAGE_KEYS`, `FINAL_STATUSES`, and the other helpers exactly as they are — they derive from the array.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run tests/leasingStages.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/leasingStages.js server/tests/leasingStages.test.js
git commit -m "feat(leasing): reshape stage engine to 6-stage lessor flow"
```

---

### Task 2: Accepted inquiry rests at Send Requirements

**Files:**
- Modify: `server/src/services/leasingTransactionService.js` (`ensureForInquiry`, lines 57-81)
- Test: `server/tests/leasingTransactions.test.js` (update assertions at lines 34, 48, 63-65, 82)

**Interfaces:**
- Consumes: `LEASING_STAGES` from Task 1.
- Produces: after an inquiry is accepted, the transaction is at `stage: "SEND_REQUIREMENTS"`, `status: "Pending"`, with `stageData.INQUIRY = { status: "Qualified", completedAt }`.

- [ ] **Step 1: Update the tests to the new stages (write the new expectations)**

In `server/tests/leasingTransactions.test.js` make these exact edits:

Line 34 — change:
```js
    expect(txn.stage).toBe("UNIT_REGISTRATION"); // inquiry + accept are complete
```
to:
```js
    expect(txn.stage).toBe("SEND_REQUIREMENTS"); // inquiry complete, awaiting requirements
```

Line 48 — change:
```js
    expect(adv.body.stageData.UNIT_REGISTRATION.completedAt).toBeTruthy();
```
to:
```js
    expect(adv.body.stageData.SEND_REQUIREMENTS.completedAt).toBeTruthy();
```

Lines 62-65 — change the valid-status body from `"Unit Registered"` to a status valid for Send Requirements:
```js
    const ok = await request(app).patch(`/api/leasing-transactions/${txnId}/status`)
      .set("Authorization", `Bearer ${token}`).send({ status: "Complete" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("Complete");
```

Line 82 — change:
```js
    expect(ret.body.stage).toBe("UNIT_REGISTRATION");
```
to:
```js
    expect(ret.body.stage).toBe("SEND_REQUIREMENTS");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/leasingTransactions.test.js`
Expected: FAIL — `ensureForInquiry` still seeds `UNIT_REGISTRATION`.

- [ ] **Step 3: Rewrite `ensureForInquiry`**

In `server/src/services/leasingTransactionService.js`, replace the body of `ensureForInquiry` (the `stageData`, `create`, and `logEvent` — lines 63-79) so it reads:

```js
  const now = stampNow();
  const reference = await nextReference();
  const stageData = {
    INQUIRY: { status: "Qualified", completedAt: now },
    SEND_REQUIREMENTS: { status: "Pending", startedAt: now },
  };
  const txn = await prisma.leasingTransaction.create({
    data: {
      reference,
      stage: "SEND_REQUIREMENTS",
      status: "Pending",
      stageData,
      lesseeName: inquiry.fullName,
      inquiryId: inquiry.id,
      assignedOfficerId: inquiry.assignedToId || actor?.userId || null,
    },
  });
  await logEvent(txn.id, actor, `Inquiry accepted — transaction ${reference} created`, "INQUIRY");
  return txn;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/leasingTransactions.test.js`
Expected: PASS (all tests in the file, including the advance/status/return ones).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/leasingTransactionService.js server/tests/leasingTransactions.test.js
git commit -m "feat(leasing): accepted inquiry now rests at Send Requirements"
```

---

### Task 3: Optional `startStage` (skippable Inquiry) on staff-created transactions

**Files:**
- Modify: `server/src/validation/leasingTransaction.js` (`txnCreateSchema`, lines 3-9)
- Modify: `server/src/services/leasingTransactionService.js` (imports line 4-7; `createTransaction`, lines 124-142)
- Test: `server/tests/leasingTransactions.test.js` (add one test)

**Interfaces:**
- Consumes: `STAGE_KEYS`, `stageIndex`, `stageByKey` from `shared/leasingStages.js`.
- Produces: `POST /api/leasing-transactions` accepts optional `startStage`; when it is a stage after `INQUIRY`, all preceding stages are stamped `{ status: "Skipped", completedAt }` and the transaction starts at the chosen stage's `initial` status.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("Leasing transactions ...")` block in `server/tests/leasingTransactions.test.js` (e.g. after the auto-create test):

```js
  it("lets staff start a transaction at Send Requirements, skipping Inquiry", async () => {
    const { token } = await makeOfficer();
    const res = await request(app).post("/api/leasing-transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ lesseeName: "Registered Lessor", startStage: "SEND_REQUIREMENTS" });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe("SEND_REQUIREMENTS");
    expect(res.body.status).toBe("Pending");
    expect(res.body.stageData.INQUIRY.status).toBe("Skipped");
    expect(res.body.stageData.INQUIRY.completedAt).toBeTruthy();
  });

  it("defaults a staff-created transaction to the Inquiry stage", async () => {
    const { token } = await makeOfficer();
    const res = await request(app).post("/api/leasing-transactions")
      .set("Authorization", `Bearer ${token}`).send({ lesseeName: "Walk-in" });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe("INQUIRY");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run tests/leasingTransactions.test.js`
Expected: FAIL — `startStage` is ignored, so the first test gets `stage: "INQUIRY"`.

- [ ] **Step 3: Allow `startStage` in the create schema**

In `server/src/validation/leasingTransaction.js`, add the import at the top and the field:

```js
import { z } from "zod";
import { STAGE_KEYS } from "../../../shared/leasingStages.js";

export const txnCreateSchema = z.object({
  lesseeName: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  tenantId: z.string().optional().nullable(),
  unitOwnerId: z.string().optional().nullable(),
  assignedOfficerId: z.string().optional().nullable(),
  startStage: z.string().refine((v) => STAGE_KEYS.includes(v), "invalid startStage").optional(),
});
```

- [ ] **Step 4: Honor `startStage` in `createTransaction`**

In `server/src/services/leasingTransactionService.js`, extend the import from the shared module (line 4-7) to include `STAGE_KEYS` and `stageIndex`:

```js
import {
  LEASING_STAGES, STAGE_KEYS, stageByKey, stageIndex, nextStageKey, prevStageKey,
  isValidStatus, isFinalStage, APPROVAL_ROUTING, APPROVAL_STEP_STATUSES,
} from "../../../shared/leasingStages.js";
```

Then replace `createTransaction` (lines 124-142) with:

```js
export async function createTransaction(actor, data) {
  const reference = await nextReference();
  const startKey = data.startStage && STAGE_KEYS.includes(data.startStage)
    ? data.startStage : LEASING_STAGES[0].key;
  const startIdx = stageIndex(startKey);
  const startCfg = stageByKey(startKey);
  const now = stampNow();

  const stageData = {};
  for (let i = 0; i < startIdx; i++) {
    stageData[STAGE_KEYS[i]] = { status: "Skipped", completedAt: now };
  }
  stageData[startKey] = { status: startCfg.initial, startedAt: now };

  const txn = await prisma.leasingTransaction.create({
    data: {
      reference,
      stage: startKey,
      status: startCfg.initial,
      stageData,
      lesseeName: data.lesseeName || null,
      unitId: data.unitId || null,
      tenantId: data.tenantId || null,
      unitOwnerId: data.unitOwnerId || null,
      assignedOfficerId: data.assignedOfficerId || actor?.userId || null,
    },
  });
  if (startKey === "APPROVAL") await ensureApprovalSteps(txn.id);
  await logEvent(txn.id, actor, `Transaction ${reference} created`, startKey);
  return getTransaction(txn.id);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd server && npx vitest run tests/leasingTransactions.test.js`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add server/src/validation/leasingTransaction.js server/src/services/leasingTransactionService.js server/tests/leasingTransactions.test.js
git commit -m "feat(leasing): staff can start a transaction at Send Requirements (skip Inquiry)"
```

---

### Task 4: Fix the approval-routing test for the new next-stage

**Files:**
- Test: `server/tests/leasingApproval.test.js` (line 58)

**Interfaces:**
- Consumes: the new stage order (APPROVAL → UNIT_INSPECTION).

- [ ] **Step 1: Update the expectation**

In `server/tests/leasingApproval.test.js`, change line 58:
```js
    expect(adv.body.stage).toBe("UNIT_SHOOT");
```
to:
```js
    expect(adv.body.stage).toBe("UNIT_INSPECTION");
```

(The single `advance` calls that reach `APPROVAL` — lines 29, 40, 64 — remain correct: an accepted inquiry now rests at `SEND_REQUIREMENTS`, and one advance moves it to `APPROVAL`.)

- [ ] **Step 2: Run the file to verify it passes**

Run: `cd server && npx vitest run tests/leasingApproval.test.js`
Expected: PASS (all tests).

- [ ] **Step 3: Run the whole server suite to confirm nothing else references old stages**

Run: `cd server && npx vitest run`
Expected: PASS. If any other test fails on a stage name, update that literal to the new key/status and re-run.

- [ ] **Step 4: Commit**

```bash
git add server/tests/leasingApproval.test.js
git commit -m "test(leasing): approval stage now advances to Unit Inspection"
```

---

### Task 5: Update the tracker UI (icons + terminal check)

**Files:**
- Modify: `client/src/components/DeliveryTracker.vue` (`STAGE_ICON`, lines 18-22; `isDelivered`, line 25)
- Test: `client/tests/DeliveryTracker.test.js` (update)

**Interfaces:**
- Consumes: new stage keys. Produces: a 6-milestone tracker whose "delivered" state is `PHOTOSHOOT` + `Completed`.

- [ ] **Step 1: Update the test to the new stages**

Replace the body of `client/tests/DeliveryTracker.test.js` with:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DeliveryTracker from "../src/components/DeliveryTracker.vue";

describe("DeliveryTracker (parcel-style tracker)", () => {
  it("renders a hero with the tracking number and 6 milestones", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000001", currentStage: "APPROVAL", status: "Under Review" } });
    expect(w.find(".hero__ref").text()).toBe("RBU-2026-000001");
    expect(w.findAll(".ms")).toHaveLength(6);
    const ms = w.findAll(".ms");
    expect(ms[0].classes()).toContain("done");     // Inquiry
    expect(ms[2].classes()).toContain("current");  // Approval (index 2)
    expect(ms[3].classes()).toContain("upcoming"); // Unit Inspection
  });

  it("shows a delivered state when the Photoshoot is Completed", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000002", currentStage: "PHOTOSHOOT", status: "Completed", finalStatus: "Completed" } });
    expect(w.find(".hero__state").text()).toContain("Completed");
    expect(w.find(".hero__state").classes()).toContain("delivered");
    expect(w.findAll(".bar__seg.on")).toHaveLength(6);
  });

  it("can hide the hero (timeline only)", () => {
    const w = mount(DeliveryTracker, { props: { currentStage: "KEY_TURNOVER", showHero: false } });
    expect(w.find(".hero").exists()).toBe(false);
    expect(w.findAll(".ms")).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run tests/DeliveryTracker.test.js`
Expected: FAIL — tracker still has 10 milestones and keys off `FINAL_STATUS`.

- [ ] **Step 3: Update the icon map**

In `client/src/components/DeliveryTracker.vue`, replace the `STAGE_ICON` object (lines 18-22) with:

```js
const STAGE_ICON = {
  INQUIRY: "📝", SEND_REQUIREMENTS: "📎", APPROVAL: "✅",
  UNIT_INSPECTION: "🔍", KEY_TURNOVER: "🔑", PHOTOSHOOT: "📸",
};
```

- [ ] **Step 4: Update the terminal check**

In the same file, replace `isDelivered` (line 25) with:

```js
const isDelivered = computed(() => props.currentStage === "PHOTOSHOOT" && (props.finalStatus || props.status) === "Completed");
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run tests/DeliveryTracker.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/DeliveryTracker.vue client/tests/DeliveryTracker.test.js
git commit -m "feat(leasing): tracker renders the 6 lessor stages, delivered at Photoshoot"
```

---

### Task 6: Update the transaction-detail view test

**Files:**
- Test: `client/tests/TransactionDetailView.test.js` (baseTxn lines 6-7; assertions lines 48-49)

**Interfaces:**
- Consumes: new stages. `TransactionDetailView.vue` is generic over the stage list and needs no code change (verified: it references no removed stage keys).

- [ ] **Step 1: Update the fixture and assertions**

In `client/tests/TransactionDetailView.test.js`:

Lines 6-7 — change the fixture's stage from `UNIT_REGISTRATION` to `SEND_REQUIREMENTS`:
```js
const baseTxn = {
  id: "t1", reference: "RBU-2026-000001", stage: "SEND_REQUIREMENTS", status: "Pending",
  finalStatus: null, stageData: { SEND_REQUIREMENTS: { status: "Pending", startedAt: "2026-08-24T00:00:00Z" } },
```
(keep the rest of the object lines 8-11 unchanged)

Line 48 — change:
```js
    expect(w.find(".stage-name").text()).toBe("Unit Registration");
```
to:
```js
    expect(w.find(".stage-name").text()).toBe("Send Requirements");
```

Line 49 — change:
```js
    expect(w.findAll(".ms")).toHaveLength(10); // delivery-tracker milestones
```
to:
```js
    expect(w.findAll(".ms")).toHaveLength(6); // delivery-tracker milestones
```

(The advance test at lines 53-61 stays valid: `SEND_REQUIREMENTS`'s next stage is `APPROVAL`, so the button reads "Advance to Approval" and the mocked advance returns `stage: "APPROVAL"`.)

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd client && npx vitest run tests/TransactionDetailView.test.js`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the whole client suite**

Run: `cd client && npx vitest run`
Expected: PASS. If another client test references an old stage key, fix that literal and re-run.

- [ ] **Step 4: Commit**

```bash
git add client/tests/TransactionDetailView.test.js
git commit -m "test(leasing): transaction detail view uses the new stages"
```

---

### Task 7: Staff "New transaction" dialog with a start-stage choice

**Files:**
- Modify: `client/src/views/TransactionsView.vue` (`createNew`, lines 36-43; add reactive state; add a modal in the template)

**Interfaces:**
- Consumes: `leasingTransactions.create` (already forwards its whole payload — no `resource.js` change).
- Produces: the create call POSTs `{ lesseeName, startStage }`.

- [ ] **Step 1: Replace the prompt-based `createNew` with dialog state**

In `client/src/views/TransactionsView.vue`, replace the `createNew` function (lines 36-43) with the following reactive state + submit function:

```js
const creating = ref(false);
const newName = ref("");
const newStartStage = ref("INQUIRY");
const createError = ref("");

function openCreate() {
  newName.value = "";
  newStartStage.value = "INQUIRY";
  createError.value = "";
  creating.value = true;
}
async function submitCreate() {
  try {
    const t = await leasingTransactions.create({
      lesseeName: newName.value.trim() || null,
      startStage: newStartStage.value,
    });
    creating.value = false;
    router.push(`/app/transactions/${t.id}`);
  } catch (e) {
    createError.value = e.response?.data?.error || "Could not create transaction";
  }
}
```

- [ ] **Step 2: Point the button at the dialog and add the modal**

In the template, change the New-transaction button (line 53) from `@click="createNew"` to `@click="openCreate"`:

```html
      <button type="button" class="primary" @click="openCreate">New transaction</button>
```

Then add this modal just before the closing `</section>` (after the `</table>`, around line 79):

```html
    <div v-if="creating" class="modal-backdrop" @click.self="creating = false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="New transaction">
        <h2>New transaction</h2>
        <div class="field">
          <label for="txn-name">Lessee / lessor name</label>
          <input id="txn-name" type="text" v-model="newName" placeholder="e.g. Juan dela Cruz" />
        </div>
        <div class="field">
          <label for="txn-start">Start at</label>
          <select id="txn-start" v-model="newStartStage">
            <option value="INQUIRY">Inquiry</option>
            <option value="SEND_REQUIREMENTS">Send Requirements (registered lessor)</option>
          </select>
        </div>
        <p v-if="createError" class="error">{{ createError }}</p>
        <div class="modal-actions">
          <button type="button" class="cancel" @click="creating = false">Cancel</button>
          <button type="button" class="primary" @click="submitCreate">Create</button>
        </div>
      </div>
    </div>
```

Add these styles inside the `<style scoped>` block:

```css
.modal-backdrop { position: fixed; inset: 0; background: rgba(9,30,22,0.45); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-lg); padding: 1.5rem; width: min(420px, 92vw); }
.modal h2 { margin: 0 0 1rem; }
.modal .field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.9rem; }
.modal label { font-size: 0.75rem; font-weight: 600; color: var(--muted); }
.modal input, .modal select { font: inherit; padding: 0.6rem 0.7rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.5rem; }
```

- [ ] **Step 3: Verify the client suite still passes and build**

Run: `cd client && npx vitest run`
Expected: PASS (no test targets `createNew` directly; this guards against regressions).

Run: `npm --workspace client run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/TransactionsView.vue
git commit -m "feat(leasing): New-transaction dialog with an Inquiry / Send Requirements start choice"
```

---

### Task 8: Full verification and manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS (all files, including `leasingStages`, `leasingTransactions`, `leasingApproval`).

- [ ] **Step 2: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS (including `DeliveryTracker`, `TransactionDetailView`).

- [ ] **Step 3: Rebuild the client and restart the server**

```bash
npm --workspace client run build
```
Then stop any running `node src/index.js` on port 5050 and start it again:
```bash
cd server && NODE_ENV=production node src/index.js
```

- [ ] **Step 4: Manual smoke test (API)**

With the server on :5050, sign in as `Admin`, submit an inquiry, accept it, and confirm the transaction rests at Send Requirements, then advance to the end:

```bash
BASE=http://localhost:5050/api
TOK=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"email":"Admin","password":"<admin-password>"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
# staff-created, skipping Inquiry:
curl -s -X POST $BASE/leasing-transactions -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"lesseeName":"Smoke Test","startStage":"SEND_REQUIREMENTS"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s);console.log('stage:',t.stage,'| INQUIRY:',t.stageData.INQUIRY.status)})"
```
Expected: `stage: SEND_REQUIREMENTS | INQUIRY: Skipped`.

Then delete the smoke-test transaction (as ADMIN): `curl -s -X DELETE $BASE/leasing-transactions/<id> -H "Authorization: Bearer $TOK"`.

- [ ] **Step 5: Final commit (if any test literals were touched in Steps 1-2)**

```bash
git add -A
git commit -m "test(leasing): finalize stage-engine reshape verification"
```
(If nothing changed, skip.)

---

## Notes for the implementer

- **Order matters:** Task 1 changes the shared stage list, which the server and client tests assert against. Between Task 1 and Task 2, the `leasingTransactions`/`leasingApproval` suites are red — that is expected; they go green as their tasks land. Run each task's targeted test file (commands given) rather than the whole suite until Task 4/6/8.
- **No migration.** Do not add a Prisma migration; stages are JSON.
- **Do not rename `lesseeAction`** — the tracker reads that field name.
