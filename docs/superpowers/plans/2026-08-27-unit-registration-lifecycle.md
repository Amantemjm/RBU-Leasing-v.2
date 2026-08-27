# Unit Registration Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give units a Draft → Submitted → Approved/Rejected lifecycle with a required rejection remark, and let lessors draft, edit, and re-submit their own units.

**Architecture:** Extend the `UnitApprovalStatus` enum and add `Unit.reviewRemarks` (one Prisma migration). The server service gains draft/submit/edit transitions with owner-scoping guards; staff approve/reject-with-remarks. Three client views (Register, My Units, Approvals) and the `units` resource wrapper get the new actions.

**Tech Stack:** Node/Express, Prisma (PostgreSQL), Zod, Vitest+Supertest (server); Vue 3, Vitest+@vue/test-utils (client).

## Global Constraints

- Enum values are exactly `DRAFT, SUBMITTED, APPROVED, REJECTED`. `Unit.approvalStatus` default stays `APPROVED`.
- Owner submissions: `submit:true` → `SUBMITTED`, else `DRAFT`. Admin/officer create is unchanged (default `APPROVED`).
- A lessor may edit/submit **only their own** unit and **only while `DRAFT` or `REJECTED`**.
- Reject **requires** a non-empty `remarks`; approve and submit **clear** `reviewRemarks`.
- Server tests run against `rbu_leasing_test` (forced by `server/tests/setup.env.js`, guarded). Run one file: `cd server && npx vitest run tests/<file>`; client: `cd client && npx vitest run tests/<file>`.
- No behavior change to unrelated unit fields or the estate/tower hierarchy.

---

### Task 1: Schema — lifecycle enum + reviewRemarks + migration

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `UnitApprovalStatus` lines 27-31; `model Unit` add field)
- Create: `server/prisma/migrations/20260827090000_unit_lifecycle/migration.sql`

**Interfaces:**
- Produces: enum `UnitApprovalStatus { DRAFT, SUBMITTED, APPROVED, REJECTED }`; `Unit.reviewRemarks String?`.

- [ ] **Step 1: Edit the schema**

In `server/prisma/schema.prisma`, replace the enum:
```prisma
enum UnitApprovalStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
}
```
And in `model Unit`, add after the `approvalStatus` line:
```prisma
  reviewRemarks  String?
```

- [ ] **Step 2: Write TWO migration files**

Postgres cannot add an enum value and then use that value in the same transaction, so the enum change and the data update must be in separate migrations. Create exactly these two files (and no others):

`server/prisma/migrations/20260827090000_unit_lifecycle_enum/migration.sql`:
```sql
-- New lifecycle values. Postgres cannot use a freshly-added value in the same
-- transaction, so the data update that references them lives in the next migration.
ALTER TYPE "UnitApprovalStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "UnitApprovalStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
```

`server/prisma/migrations/20260827090001_unit_lifecycle_data/migration.sql`:
```sql
-- Rejection/approval remark shown to the lessor.
ALTER TABLE "Unit" ADD COLUMN "reviewRemarks" TEXT;
-- Retire PENDING: existing owner submissions become SUBMITTED. PENDING stays in
-- the enum type as an unused value (Postgres cannot drop an enum value cleanly);
-- application code never writes it again.
UPDATE "Unit" SET "approvalStatus" = 'SUBMITTED' WHERE "approvalStatus" = 'PENDING';
```

Do NOT create a `migration_lock.toml` or edit existing migrations. `prisma migrate deploy` applies both in filename order.

- [ ] **Step 3: Apply to the test DB and regenerate**

Run:
```
cd server && DATABASE_URL="postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing_test?schema=public" npx prisma migrate deploy && npx prisma generate
```
Expected: both migrations apply; client regenerates. (Stop any running server first if `prisma generate` reports EPERM on the query engine DLL.)

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(units): add DRAFT/SUBMITTED lifecycle enum + reviewRemarks"
```

---

### Task 2: Service + validation — lifecycle transitions

**Files:**
- Modify: `server/src/services/unitService.js` (`createUnitForUser` lines 36-46; `approveUnit` 48-52; `updateUnit` 66-71; add `submitUnit`, `rejectUnit`)
- Modify: `server/src/validation/unit.js`
- Test: `server/tests/unitLifecycle.test.js` (create); `server/tests/unitsOwner.test.js` (update PENDING literals)

**Interfaces:**
- Consumes: enum from Task 1.
- Produces: `createUnitForUser(user,{...,submit})`, `updateUnit(user,id,data)` (owner-guarded), `submitUnit(user,id)`, `approveUnit(id)`, `rejectUnit(id,remarks)`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/unitLifecycle.test.js`:
```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("Unit lifecycle", () => {
  it("owner create saves a DRAFT by default and SUBMITTED with submit:true", async () => {
    const o = await factory.owner();
    const draft = await request(app).post("/api/units").set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "D1" });
    expect(draft.body.approvalStatus).toBe("DRAFT");
    const sub = await request(app).post("/api/units").set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "S1", submit: true });
    expect(sub.body.approvalStatus).toBe("SUBMITTED");
  });

  it("owner can edit a DRAFT and REJECTED unit but not a SUBMITTED one", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { unitNumber: "X", approvalStatus: "DRAFT" });
    const ok = await request(app).patch(`/api/units/${u.id}`).set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "X2" });
    expect(ok.status).toBe(200);
    expect(ok.body.unitNumber).toBe("X2");

    const locked = await factory.unit(o.id, { unitNumber: "Y", approvalStatus: "SUBMITTED" });
    const blocked = await request(app).patch(`/api/units/${locked.id}`).set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "Y2" });
    expect(blocked.status).toBe(409);
  });

  it("owner cannot edit another owner's unit (404)", async () => {
    const o1 = await factory.owner(); const o2 = await factory.owner({ name: "Two" });
    const u = await factory.unit(o2.id, { approvalStatus: "DRAFT" });
    const res = await request(app).patch(`/api/units/${u.id}`).set(auth(tokens.owner(o1.id)))
      .send({ unitNumber: "Z" });
    expect(res.status).toBe(404);
  });

  it("submit moves DRAFT/REJECTED to SUBMITTED and clears remarks", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { approvalStatus: "REJECTED", reviewRemarks: "Fix floor" });
    const res = await request(app).patch(`/api/units/${u.id}/submit`).set(auth(tokens.owner(o.id)));
    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe("SUBMITTED");
    expect(res.body.reviewRemarks).toBeNull();
  });

  it("staff reject requires remarks and records them; approve clears them", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { approvalStatus: "SUBMITTED" });
    const noReason = await request(app).patch(`/api/units/${u.id}/reject`).set(auth(tokens.officer())).send({});
    expect(noReason.status).toBe(400);
    const rej = await request(app).patch(`/api/units/${u.id}/reject`).set(auth(tokens.officer()))
      .send({ remarks: "Missing slot number" });
    expect(rej.body.approvalStatus).toBe("REJECTED");
    expect(rej.body.reviewRemarks).toBe("Missing slot number");
    const app2 = await request(app).patch(`/api/units/${u.id}/approve`).set(auth(tokens.officer()));
    expect(app2.body.approvalStatus).toBe("APPROVED");
    expect(app2.body.reviewRemarks).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/unitLifecycle.test.js`
Expected: FAIL (owner create still yields `PENDING`; no `submit`/`reject` routes yet — several 404/400 mismatches).

- [ ] **Step 3: Update validation**

In `server/src/validation/unit.js`, add `submit` to `unitCreateSchema` and a reject schema:
```js
export const unitCreateSchema = z.object({
  ownerId: z.string().min(1),
  unitNumber: z.string().min(1),
  towerId: z.string().nullish(),
  building: z.string().nullish(),
  floor: z.string().nullish(),
  slotNo: z.string().nullish(),
  type: z.string().nullish(),
  sizeSqm: z.coerce.number().nonnegative().nullish(),
  baseRent: z.coerce.number().nonnegative().nullish(),
  status: z.enum(["VACANT", "OCCUPIED"]).optional(),
  submit: z.boolean().optional(),
});

export const unitUpdateSchema = unitCreateSchema.partial();

export const unitRejectSchema = z.object({ remarks: z.string().min(1, "A remark is required") });
```

- [ ] **Step 4: Implement the service transitions**

In `server/src/services/unitService.js`:

Replace `createUnitForUser` so an owner draft/submit is honored (the `submit` flag is not a Unit column — strip it before create):
```js
export async function createUnitForUser(user, data) {
  const { submit, ...fields } = data;
  const payload = { ...fields };
  if (payload.baseRent == null) payload.baseRent = 0; // base rent lives on the lease
  if (user.role === "UNIT_OWNER") {
    payload.ownerId = user.unitOwnerId; // force own owner
    payload.approvalStatus = submit ? "SUBMITTED" : "DRAFT";
  }
  await assertOwnerExists(payload.ownerId);
  if (payload.towerId) await assertTowerExists(payload.towerId);
  return prisma.unit.create({ data: payload, include: withHierarchy });
}
```

Replace `updateUnit` to guard owner edits (staff keep full update). Add a `void submit` strip so an owner PATCH carrying `submit` doesn't hit the column:
```js
export async function updateUnit(user, id, data) {
  const unit = await getUnit(id);
  const { submit, ...fields } = data;
  void submit;
  if (user && user.role === "UNIT_OWNER") {
    if (unit.ownerId !== user.unitOwnerId) throw new NotFoundError("Unit not found");
    if (!["DRAFT", "REJECTED"].includes(unit.approvalStatus)) {
      throw new ConflictError("This unit can no longer be edited");
    }
    fields.ownerId = user.unitOwnerId; // never let an owner reassign
    delete fields.approvalStatus;      // status changes only via submit/approve/reject
  }
  if (fields.ownerId) await assertOwnerExists(fields.ownerId);
  if (fields.towerId) await assertTowerExists(fields.towerId);
  return prisma.unit.update({ where: { id }, data: fields, include: withHierarchy });
}
```

Add `submitUnit` and rewrite approve/reject to manage `reviewRemarks`:
```js
export async function submitUnit(user, id) {
  const unit = await getUnit(id);
  if (user && user.role === "UNIT_OWNER" && unit.ownerId !== user.unitOwnerId) {
    throw new NotFoundError("Unit not found");
  }
  if (!["DRAFT", "REJECTED"].includes(unit.approvalStatus)) {
    throw new ConflictError("Only a draft or rejected unit can be submitted");
  }
  return prisma.unit.update({
    where: { id }, data: { approvalStatus: "SUBMITTED", reviewRemarks: null }, include: withHierarchy,
  });
}

export async function approveUnit(id) {
  await getUnit(id);
  return prisma.unit.update({
    where: { id }, data: { approvalStatus: "APPROVED", reviewRemarks: null }, include: withHierarchy,
  });
}

export async function rejectUnit(id, remarks) {
  await getUnit(id);
  return prisma.unit.update({
    where: { id }, data: { approvalStatus: "REJECTED", reviewRemarks: remarks }, include: withHierarchy,
  });
}
```
(Remove the old `approveUnit(id, decision)` two-arg version.)

Ensure `NotFoundError`, `ConflictError`, `InvalidReferenceError` are imported at the top (they already are).

- [ ] **Step 5: Update `unitsOwner.test.js` to the new statuses**

In `server/tests/unitsOwner.test.js`, change every `approvalStatus: "PENDING"` literal to `"SUBMITTED"` (lines 14, 44, 52, 61), the `?approvalStatus=PENDING` query to `?approvalStatus=SUBMITTED` (line 63), and the two owner-create assertions (lines 29, 38) from `"PENDING"` to `"DRAFT"` (owner create now defaults to draft; the test posts no `submit` flag). Update the test titles mentioning "pending" to "submitted"/"draft" accordingly.

- [ ] **Step 6: Run both files to green**

Run: `cd server && npx vitest run tests/unitLifecycle.test.js tests/unitsOwner.test.js`
Expected: PASS. (The routes for `/:id/submit` and `/:id/reject` and the owner PATCH are added in Task 3 — if these tests need them, do Task 3's route edits together with this task before running. See Task 3; the controller/route wiring below is required for the HTTP-level tests here to pass.)

- [ ] **Step 7: Commit**

```bash
git add server/src/services/unitService.js server/src/validation/unit.js server/tests/unitLifecycle.test.js server/tests/unitsOwner.test.js
git commit -m "feat(units): draft/submit/edit/approve/reject lifecycle transitions"
```

---

### Task 3: Routes + controller wiring

**Files:**
- Modify: `server/src/controllers/unitController.js` (`create`, `update`, `approve`, `reject`; add `submit`)
- Modify: `server/src/routes/unitRoutes.js`

**Interfaces:**
- Consumes: service functions from Task 2.
- Produces: `POST /units` (owner honors `submit`); `PATCH /units/:id` (owner allowed, guarded); `PATCH /units/:id/submit`; `PATCH /units/:id/reject` (body `{remarks}`); `PATCH /units/:id/approve`.

> Do Task 2's HTTP-level tests and this task together — the tests exercise these routes.

- [ ] **Step 1: Update the controller**

In `server/src/controllers/unitController.js`, replace `update`, `approve`, `reject` and add `submit`:
```js
export async function update(req, res, next) {
  try {
    const data = unitUpdateSchema.parse(req.body);
    res.json(await service.updateUnit(req.user, req.params.id, data));
  } catch (e) { next(e); }
}
export async function submit(req, res, next) {
  try { res.json(await service.submitUnit(req.user, req.params.id)); } catch (e) { next(e); }
}
export async function approve(req, res, next) {
  try { res.json(await service.approveUnit(req.params.id)); } catch (e) { next(e); }
}
export async function reject(req, res, next) {
  try {
    const { remarks } = unitRejectSchema.parse(req.body);
    res.json(await service.rejectUnit(req.params.id, remarks));
  } catch (e) { next(e); }
}
```
Add `unitRejectSchema` to the validation import at the top:
```js
import { unitCreateSchema, unitUpdateSchema, unitRejectSchema } from "../validation/unit.js";
```
(`create` already forces `ownerId` for owners and passes the body — it now also carries `submit`; no change needed there beyond what Task 2's service does.)

- [ ] **Step 2: Update the routes**

In `server/src/routes/unitRoutes.js`, allow owners to update/submit their own unit; keep approve/reject write-staff:
```js
router.patch("/:id", requireRole("ADMIN", "LEASING_OFFICER", "UNIT_OWNER"), ctrl.update);
router.patch("/:id/submit", requireRole("ADMIN", "LEASING_OFFICER", "UNIT_OWNER"), ctrl.submit);
router.patch("/:id/approve", requireWrite, ctrl.approve);
router.patch("/:id/reject", requireWrite, ctrl.reject);
```
(Leave `POST /`, `GET`, `DELETE` as they are.)

- [ ] **Step 3: Run the lifecycle + owner suites**

Run: `cd server && npx vitest run tests/unitLifecycle.test.js tests/unitsOwner.test.js`
Expected: PASS.

- [ ] **Step 4: Run the whole server suite for regressions**

Run: `cd server && npx vitest run`
Expected: PASS. If `tests/units.test.js` or `tests/unitsHierarchy.test.js` assert `approvalStatus === "PENDING"` or the old two-arg `approveUnit`, update those literals to the new values and re-run.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/unitController.js server/src/routes/unitRoutes.js server/tests
git commit -m "feat(units): owner edit/submit routes + reject-with-remarks"
```

---

### Task 4: Client resource wrappers + Register view (Draft / Submit)

**Files:**
- Modify: `client/src/lib/resource.js` (add `submitUnit`, `rejectUnit` remarks arg)
- Modify: `client/src/views/RegisterUnitView.vue` (two-button submit)
- Test: `client/tests/RegisterUnitView.test.js` (update)

**Interfaces:**
- Produces: `submitUnit(id)`; `rejectUnit(id, remarks)`; register view posts `submit` flag.

- [ ] **Step 1: Update resource wrappers**

In `client/src/lib/resource.js`, change `rejectUnit` to take remarks and add `submitUnit` (near the existing `approveUnit`/`rejectUnit`):
```js
export function approveUnit(id) {
  return api.patch(`/units/${id}/approve`).then((r) => r.data);
}
export function rejectUnit(id, remarks) {
  return api.patch(`/units/${id}/reject`, { remarks }).then((r) => r.data);
}
export function submitUnit(id) {
  return api.patch(`/units/${id}/submit`).then((r) => r.data);
}
```

- [ ] **Step 2: Update the register test for two actions**

In `client/tests/RegisterUnitView.test.js`, adjust the two submit-related tests so submitting includes `submit: true`. Change the "submits the captured fields" test's `toMatchObject` to also expect `submit: true`, and drive it via the primary submit button. Add a draft test:
```js
  it("saves a draft without submitting for approval", async () => {
    const w = await mountView();
    await w.find("#unitNumber").setValue("6D");
    await w.find("button.draft").trigger("click");
    await flushPromises();
    const payload = units.create.mock.calls[0][0];
    expect(payload.unitNumber).toBe("6D");
    expect(payload.submit).toBe(false);
  });
```
And in "submits the captured fields", after the existing `toMatchObject`, add: `expect(payload.submit).toBe(true);` and trigger submission via `w.find("button.submit").trigger("click")` (the primary action) rather than form submit if the form now has two buttons; if the primary button remains a `type="submit"`, keep `form.trigger("submit.prevent")`.

- [ ] **Step 3: Register view — two buttons + edit-by-id**

In `client/src/views/RegisterUnitView.vue`, support both create and edit. Add `useRoute`, an `editId`, and load the unit when `?id=` is present; make `save()` take a submit flag and `create` or `update` accordingly.

Script additions/changes:
```js
import { useRoute } from "vue-router";
const route = useRoute();
const editId = ref(route.query.id || null);

// (inside onMounted, after estateOptions is populated:)
if (editId.value) {
  const u = await units.get(editId.value);
  form.unitNumber = u.unitNumber || ""; form.floor = u.floor || ""; form.slotNo = u.slotNo || "";
  form.type = u.type || ""; form.baseRent = u.baseRent != null ? String(u.baseRent) : "";
  if (u.tower?.estate?.id) { form.estateId = u.tower.estate.id; await loadTowers(form.estateId); form.towerId = u.towerId || ""; }
}

async function save(submitForApproval) {
  error.value = "";
  submitting.value = true;
  const payload = { submit: submitForApproval };
  for (const [k, v] of Object.entries(form)) {
    if (k === "estateId") continue; // UI-only
    if (v !== "" && v !== null && v !== undefined) payload[k] = v;
  }
  try {
    if (editId.value) {
      await units.update(editId.value, payload);
      if (submitForApproval) await submitUnit(editId.value);
    } else {
      await units.create(payload);
    }
    done.value = true;
    setTimeout(() => router.push("/app/my-units"), 1600);
  } catch (e) {
    error.value = e.response?.data?.error || "Submit failed";
  } finally {
    submitting.value = false;
  }
}
```
Add `submitUnit` to the resource import: `import { units, estates, towers, submitUnit } from "../lib/resource.js";`. (On create, the server sets status from the `submit` flag; on edit, `units.update` saves fields — status is not changed by an owner update — and `submitUnit` performs the DRAFT/REJECTED → SUBMITTED transition when the lessor chose Submit.)

In the template, replace the single submit action with two buttons:
```html
        <button type="button" class="draft" :disabled="submitting" @click="save(false)">Save as draft</button>
        <button type="submit" class="submit" :disabled="submitting" @click.prevent="save(true)">Submit for approval</button>
```
Keep the `done` success panel; when `editId` is set, its heading may read "Saved" instead of "Submitted for approval" (optional polish).

- [ ] **Step 4: Run the register test + client suite**

Run: `cd client && npx vitest run tests/RegisterUnitView.test.js`
Expected: PASS. Then `cd client && npx vitest run` — PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/resource.js client/src/views/RegisterUnitView.vue client/tests/RegisterUnitView.test.js
git commit -m "feat(units): register view offers Save-as-draft and Submit"
```

---

### Task 5: My Units — status, edit/submit actions, rejection remarks

**Files:**
- Modify: `client/src/views/MyUnitsView.vue`
- Test: `client/tests/MyUnitsView.test.js` (update/extend)

**Interfaces:**
- Consumes: `units.list`, `submitUnit`, router to the register/edit view.

- [ ] **Step 1: Update the test**

Read `client/tests/MyUnitsView.test.js`, then extend it so: a `REJECTED` unit renders its `reviewRemarks`, and a `DRAFT`/`REJECTED` unit shows a **Submit** control that calls `submitUnit`. Mock `units.list` to return `[{ id:"u1", unitNumber:"A", approvalStatus:"REJECTED", reviewRemarks:"Missing slot", tower:null, type:"Studio", baseRent:1000, status:"VACANT" }]` and assert the remark text renders and clicking Submit calls `submitUnit("u1")`. Keep any existing assertions that still hold.

- [ ] **Step 2: Rebuild My Units with per-row actions**

Rewrite `client/src/views/MyUnitsView.vue` to a table that shows the approval status and, for `DRAFT`/`REJECTED` rows, an Edit link (to the register/edit route) and a Submit button, plus the remark on rejection:
```html
<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units, submitUnit } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";

const rows = ref([]);
const router = useRouter();
const busy = ref({});
async function load() { rows.value = await units.list(); }
onMounted(load);
const editable = (u) => ["DRAFT", "REJECTED"].includes(u.approvalStatus);
async function submit(u) {
  if (busy.value[u.id]) return;
  busy.value = { ...busy.value, [u.id]: true };
  try { await submitUnit(u.id); await load(); } finally { busy.value = { ...busy.value, [u.id]: false }; }
}
</script>

<template>
  <section>
    <header>
      <h1>My Units</h1>
      <button type="button" @click="router.push('/app/register-unit')">Register a unit</button>
    </header>
    <table class="grid">
      <thead><tr><th>Unit #</th><th>Tower</th><th>Type</th><th>Monthly Rent</th><th>Approval</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in rows" :key="u.id">
          <td>{{ u.unitNumber }}</td>
          <td>{{ u.tower?.name || "—" }}</td>
          <td>{{ u.type }}</td>
          <td>{{ formatPHP(u.baseRent) }}</td>
          <td>
            <span class="badge" :class="u.approvalStatus.toLowerCase()">{{ u.approvalStatus }}</span>
            <div v-if="u.approvalStatus === 'REJECTED' && u.reviewRemarks" class="remark">{{ u.reviewRemarks }}</div>
          </td>
          <td class="actions">
            <button v-if="editable(u)" type="button" class="link" @click="router.push(`/app/register-unit?id=${u.id}`)">Edit</button>
            <button v-if="editable(u)" type="button" class="link submit" :disabled="busy[u.id]" @click="submit(u)">Submit</button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="6" class="muted">No units yet.</td></tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.badge { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.badge.rejected { background: var(--danger-050); color: var(--danger); }
.badge.draft { background: var(--paper); color: var(--muted); }
.remark { font-size: 0.8rem; color: var(--danger); margin-top: 0.25rem; }
.actions { white-space: nowrap; }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0.2rem 0.4rem; }
.muted { color: var(--muted); }
</style>
```
(The Edit button routes to `/app/register-unit?id=<unit.id>`; the register view loads and updates that unit — implemented in Task 4 Step 3. Both Edit and Submit are fully functional.)

- [ ] **Step 3: Run the test + client suite**

Run: `cd client && npx vitest run tests/MyUnitsView.test.js` then `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/MyUnitsView.vue client/tests/MyUnitsView.test.js
git commit -m "feat(units): My Units shows status, remarks, and edit/submit actions"
```

---

### Task 6: Approvals — Submitted queue + reject remark

**Files:**
- Modify: `client/src/views/ApprovalsView.vue`
- Test: `client/tests/ApprovalsView.test.js` (create if absent, else update)

**Interfaces:**
- Consumes: `units.list({approvalStatus:"SUBMITTED"})`, `approveUnit`, `rejectUnit(id, remarks)`.

- [ ] **Step 1: Update the query + reject flow**

In `client/src/views/ApprovalsView.vue`: change the load filter from `{ approvalStatus: "PENDING" }` to `{ approvalStatus: "SUBMITTED" }`. Change the reject action from a bare `rejectUnit(id)` to a small modal that collects a required remark and calls `rejectUnit(id, remark)` (mirror `AccountApprovalsView.vue`'s reject modal: a `rejecting` ref, a `reason` input, `confirmReject`). Keep Approve as-is.

- [ ] **Step 2: Add/adjust the test**

Ensure a client test mounts `ApprovalsView`, mocks `units.list` to return one `SUBMITTED` unit, and asserts: the list loads with the `SUBMITTED` filter, Approve calls `approveUnit`, and Reject (after entering a remark) calls `rejectUnit(id, "<remark>")`. If `client/tests/ApprovalsView.test.js` does not exist, create it following the `AccountApprovalsView` test pattern; if it exists, update its expectations.

- [ ] **Step 3: Run the test + client suite**

Run: `cd client && npx vitest run tests/ApprovalsView.test.js` then `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/ApprovalsView.vue client/tests/ApprovalsView.test.js
git commit -m "feat(units): approvals queue lists Submitted and rejects with a remark"
```

---

### Task 7: Full verification

**Files:** none (verification)

- [ ] **Step 1:** `cd server && npx vitest run` → all pass.
- [ ] **Step 2:** `cd client && npx vitest run` → all pass.
- [ ] **Step 3:** Apply the migration to the DEV DB and regenerate for the running app:
  ```
  cd server && npx prisma migrate deploy && npx prisma generate
  ```
  (Stop the running server first if `generate` hits an EPERM lock, then restart it.)
- [ ] **Step 4:** `npm --workspace client run build` → clean.
- [ ] **Step 5:** Manual smoke (server on :5050, signed in as a lessor account): register a unit as draft → it shows DRAFT in My Units; submit it → SUBMITTED; as staff, reject with a remark → REJECTED + remark visible to the lessor; edit + submit → SUBMITTED again; approve → APPROVED.

---

## Notes for the implementer

- **Enum migration caveat:** Postgres can't add an enum value and use it in the same transaction, and can't drop a value cleanly — hence two migration files (add values, then data). `PENDING` remains an orphaned, unused enum value; do not attempt to remove it.
- Tasks 2 and 3 are coupled (the service tests hit the new routes) — implement the routes/controller (Task 3 Steps 1-2) before running Task 2 Step 6.
- Do not weaken the staff full-update path on `PATCH /units/:id`; only add the owner-guarded branch.
