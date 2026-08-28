# Centralized Lessor Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A staff-facing Lessor Profile page that consolidates one lessor's details, units, requirements checklist, acceptance-form status, and recent activity — from one read-only aggregate endpoint.

**Architecture:** A new `lessorProfileService.getLessorProfile(ownerId)` composes the owner + its relations (units, info sheet, portal user) plus the F requirements checklist into one object. Exposed at `GET /api/owners/:id/profile` (staff). A new Vue view renders the sections; the Owners list links to it. No schema change.

**Tech Stack:** Node/Express, Prisma, Vitest+Supertest; Vue 3, Vitest+@vue/test-utils.

## Global Constraints

- Staff-only (`requireStaff` = ADMIN/LEASING_OFFICER); a UNIT_OWNER/TENANT caller must get 403.
- Read-only aggregation — no schema change, no writes. Never include binary blobs (unit/requirement/info-sheet file bytes) in the payload.
- Requirements checklist is 7 items; `summary.approved` = count with status exactly `"Approved"`, `total` = 7.
- `activity` is newest-first, capped at 10.
- Server tests: `rbu_leasing_test` (forced+guarded). Run one file: `cd server && npx vitest run tests/<file>`; client: `cd client && npx vitest run tests/<file>`.

---

### Task 1: Server — aggregate service + endpoint

**Files:**
- Create: `server/src/services/lessorProfileService.js`
- Modify: `server/src/controllers/ownerController.js`, `server/src/routes/ownerRoutes.js`
- Test: `server/tests/lessorProfile.test.js`

**Interfaces:**
- Consumes: `lessorRequirementService.listForOwner` (F).
- Produces: `GET /api/owners/:id/profile` → `{ owner, account, units, requirements:{items,summary}, acceptanceForm, activity }`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/lessorProfile.test.js`:
```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("Lessor profile aggregate", () => {
  it("returns the owner, units, requirements checklist, form status and activity (staff)", async () => {
    const o = await factory.owner({ name: "Capitol Heights", phone: "0917" });
    await factory.unit(o.id, { unitNumber: "12A", approvalStatus: "SUBMITTED" });
    await prisma.lessorRequirement.create({ data: { unitOwnerId: o.id, requirementKey: "GOV_ID", status: "Approved", reviewedAt: new Date() } });
    await prisma.lessorInfoSheet.create({ data: { unitOwnerId: o.id, status: "SUBMITTED", submittedAt: new Date() } });

    const res = await request(app).get(`/api/owners/${o.id}/profile`).set(auth(tokens.officer()));
    expect(res.status).toBe(200);
    expect(res.body.owner.name).toBe("Capitol Heights");
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].approvalStatus).toBe("SUBMITTED");
    expect(res.body.requirements.items).toHaveLength(7);
    expect(res.body.requirements.summary).toEqual({ approved: 1, total: 7 });
    expect(res.body.acceptanceForm.status).toBe("SUBMITTED");
    expect(Array.isArray(res.body.activity)).toBe(true);
    expect(res.body.activity.length).toBeGreaterThan(0);
    // no binary blobs anywhere
    expect(JSON.stringify(res.body)).not.toContain('"data"');
  });

  it("is staff-only and 404s an unknown owner", async () => {
    const o = await factory.owner();
    const forbidden = await request(app).get(`/api/owners/${o.id}/profile`).set(auth(tokens.owner(o.id)));
    expect(forbidden.status).toBe(403);
    const missing = await request(app).get(`/api/owners/does-not-exist/profile`).set(auth(tokens.officer()));
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/lessorProfile.test.js`
Expected: FAIL — route/service missing (404 for the profile path shape or unhandled).

- [ ] **Step 3: Create the service**

Create `server/src/services/lessorProfileService.js`:
```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";
import { listForOwner } from "./lessorRequirementService.js";

export async function getLessorProfile(ownerId) {
  const owner = await prisma.unitOwner.findUnique({
    where: { id: ownerId },
    include: {
      assignedOfficer: { select: { id: true, name: true } },
      users: { select: { contactEmail: true, status: true }, take: 1 },
      units: {
        select: { id: true, unitNumber: true, approvalStatus: true, reviewRemarks: true, updatedAt: true, tower: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      lessorInfoSheets: {
        select: { status: true, submittedAt: true, reviewedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 1,
      },
    },
  });
  if (!owner) throw new NotFoundError("Lessor not found");

  const requirements = await listForOwner(ownerId);
  const approved = requirements.filter((r) => r.status === "Approved").length;
  const sheet = owner.lessorInfoSheets[0] || null;

  const activity = [];
  for (const u of owner.units) activity.push({ at: u.updatedAt, kind: "unit", label: `Unit ${u.unitNumber} — ${u.approvalStatus}` });
  for (const r of requirements) if (r.reviewedAt) activity.push({ at: r.reviewedAt, kind: "requirement", label: `${r.label} — ${r.status}` });
  if (sheet?.submittedAt) activity.push({ at: sheet.submittedAt, kind: "form", label: "Acceptance Form submitted" });
  if (sheet?.reviewedAt) activity.push({ at: sheet.reviewedAt, kind: "form", label: `Acceptance Form ${sheet.status}` });
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    owner: {
      id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, address: owner.address,
      assignedOfficer: owner.assignedOfficer,
    },
    account: owner.users[0] ? { contactEmail: owner.users[0].contactEmail, status: owner.users[0].status } : null,
    units: owner.units.map((u) => ({
      id: u.id, unitNumber: u.unitNumber, tower: u.tower?.name || null,
      approvalStatus: u.approvalStatus, reviewRemarks: u.reviewRemarks, updatedAt: u.updatedAt,
    })),
    requirements: { items: requirements, summary: { approved, total: requirements.length } },
    acceptanceForm: sheet ? { status: sheet.status, submittedAt: sheet.submittedAt, reviewedAt: sheet.reviewedAt } : null,
    activity: activity.slice(0, 10),
  };
}
```

- [ ] **Step 4: Controller + route**

In `server/src/controllers/ownerController.js`, add the import at the top and a handler:
```js
import { getLessorProfile } from "../services/lessorProfileService.js";
```
```js
export async function profile(req, res, next) {
  try { res.json(await getLessorProfile(req.params.id)); } catch (e) { next(e); }
}
```
In `server/src/routes/ownerRoutes.js`, add after the `/me` route (segment count differs from `/:id`, so ordering vs `/:id` is safe, but keep it above `/:id` for clarity):
```js
router.get("/:id/profile", requireStaff, ctrl.profile);
```

- [ ] **Step 5: Run the test + full suite**

Run: `cd server && npx vitest run tests/lessorProfile.test.js` → PASS.
Then `cd server && npx vitest run` → all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/lessorProfileService.js server/src/controllers/ownerController.js server/src/routes/ownerRoutes.js server/tests/lessorProfile.test.js
git commit -m "feat(lessor-profile): aggregate endpoint GET /owners/:id/profile"
```

---

### Task 2: Client — profile view + Owners link

**Files:**
- Modify: `client/src/lib/resource.js` (add `owners.profile`)
- Create: `client/src/views/LessorProfileView.vue`
- Modify: `client/src/router/index.js`, `client/src/views/OwnersView.vue`
- Test: `client/tests/LessorProfileView.test.js`

**Interfaces:**
- Consumes: `owners.profile(id)` → the Task 1 payload.

- [ ] **Step 1: Add the resource method**

In `client/src/lib/resource.js`, right after `export const owners = resource("/owners");`, add:
```js
owners.profile = (id) => api.get(`/owners/${id}/profile`).then((r) => r.data);
```

- [ ] **Step 2: Write the view test**

Create `client/tests/LessorProfileView.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";

const profile = {
  owner: { id: "o1", name: "Capitol Heights", email: "c@x.com", phone: "0917", address: "Pasig", assignedOfficer: { id: "u1", name: "Officer Jane" } },
  account: { contactEmail: "c@x.com", status: "APPROVED" },
  units: [{ id: "u1", unitNumber: "12A", tower: "Imperium", approvalStatus: "SUBMITTED", reviewRemarks: null, updatedAt: "2026-08-27T00:00:00Z" }],
  requirements: { items: [{ requirementKey: "GOV_ID", label: "Valid Government ID", status: "Approved" }], summary: { approved: 1, total: 7 } },
  acceptanceForm: { status: "SUBMITTED", submittedAt: "2026-08-27T00:00:00Z", reviewedAt: null },
  activity: [{ at: "2026-08-27T00:00:00Z", kind: "unit", label: "Unit 12A — SUBMITTED" }],
};
vi.mock("../src/lib/resource.js", () => ({ owners: { profile: vi.fn(() => Promise.resolve(profile)) } }));

import LessorProfileView from "../src/views/LessorProfileView.vue";
import { owners } from "../src/lib/resource.js";

const stub = { template: "<div/>" };
async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/app/lessor-profile/:id", component: LessorProfileView },
    { path: "/:pathMatch(.*)*", component: stub },
  ]});
  router.push("/app/lessor-profile/o1");
  await router.isReady();
  const w = mount(LessorProfileView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("LessorProfileView", () => {
  beforeEach(() => owners.profile.mockClear());
  it("renders the header, units, requirements summary, form and activity", async () => {
    const w = await mountView();
    expect(owners.profile).toHaveBeenCalledWith("o1");
    expect(w.text()).toContain("Capitol Heights");
    expect(w.text()).toContain("12A");
    expect(w.text()).toContain("1 of 7");           // requirements summary
    expect(w.text()).toContain("Valid Government ID");
    expect(w.text()).toContain("SUBMITTED");        // form/unit status
    expect(w.text()).toContain("Unit 12A — SUBMITTED"); // activity
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd client && npx vitest run tests/LessorProfileView.test.js`
Expected: FAIL — view doesn't exist.

- [ ] **Step 4: Create the view**

Create `client/src/views/LessorProfileView.vue`:
```html
<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { owners } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";

const route = useRoute();
const router = useRouter();
const p = ref(null);
const error = ref("");

onMounted(async () => {
  try { p.value = await owners.profile(route.params.id); }
  catch (e) { error.value = e.response?.data?.error || "Could not load lessor profile"; }
});
</script>

<template>
  <section v-if="error"><p class="error">{{ error }}</p></section>
  <section v-else-if="p" class="profile">
    <header class="head">
      <div>
        <h1>{{ p.owner.name }}</h1>
        <p class="muted">{{ [p.owner.email, p.owner.phone, p.owner.address].filter(Boolean).join(" · ") || "—" }}</p>
        <p class="muted small">Officer: {{ p.owner.assignedOfficer?.name || "Unassigned" }}<span v-if="p.account"> · Account: {{ p.account.status }}</span></p>
      </div>
    </header>

    <div class="panel">
      <h2>Units <span class="count">{{ p.units.length }}</span></h2>
      <ul class="rows">
        <li v-for="u in p.units" :key="u.id" class="row">
          <button type="button" class="link" @click="router.push(`/app/units/${u.id}`)">{{ u.unitNumber }}</button>
          <span class="muted">{{ u.tower || "—" }}</span>
          <span class="badge" :class="u.approvalStatus.toLowerCase()">{{ u.approvalStatus }}</span>
          <span v-if="u.reviewRemarks" class="muted small">{{ u.reviewRemarks }}</span>
        </li>
        <li v-if="!p.units.length" class="muted">No units.</li>
      </ul>
    </div>

    <div class="panel">
      <h2>Requirements <span class="count">{{ p.requirements.summary.approved }} of {{ p.requirements.summary.total }} approved</span></h2>
      <ul class="rows">
        <li v-for="r in p.requirements.items" :key="r.requirementKey" class="row">
          <span>{{ r.label }}</span>
          <span class="badge" :class="r.status.toLowerCase().replace(/ /g,'-')">{{ r.status }}</span>
          <span v-if="r.remarks" class="muted small">{{ r.remarks }}</span>
        </li>
      </ul>
      <button type="button" class="link" @click="router.push('/app/lessor-requirements-review')">Review requirements →</button>
    </div>

    <div class="panel">
      <h2>Acceptance Form</h2>
      <p v-if="p.acceptanceForm"><span class="badge">{{ p.acceptanceForm.status }}</span>
        <span v-if="p.acceptanceForm.submittedAt" class="muted small"> · submitted {{ formatDate(p.acceptanceForm.submittedAt) }}</span></p>
      <p v-else class="muted">No acceptance form yet.</p>
    </div>

    <div class="panel">
      <h2>Recent activity</h2>
      <ul class="rows">
        <li v-for="(a, i) in p.activity" :key="i" class="row">
          <span>{{ a.label }}</span><span class="muted small">{{ formatDate(a.at) }}</span>
        </li>
        <li v-if="!p.activity.length" class="muted">No activity yet.</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.head { margin-bottom: 1rem; }
.muted { color: var(--muted); } .small { font-size: 0.8rem; }
.panel { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.9rem 1rem; margin-bottom: 0.9rem; }
.panel h2 { font-size: 1rem; margin: 0 0 0.6rem; display: flex; align-items: baseline; gap: 0.6rem; }
.count { font-size: 0.78rem; color: var(--muted); font-weight: 500; }
.rows { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.badge.rejected, .badge.expired, .badge.for-resubmission { background: var(--danger-050); color: var(--danger); }
.badge.approved { background: var(--good-050); color: var(--good); }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; }
.error { color: var(--danger); }
</style>
```

- [ ] **Step 5: Router + Owners link**

In `client/src/router/index.js`:
```js
import LessorProfileView from "../views/LessorProfileView.vue";
```
```js
      { path: "lessor-profile/:id", component: LessorProfileView, meta: { roles: WRITE } },
```
In `client/src/views/OwnersView.vue`, make the owner **name** a link to the profile (visible to all staff, not just admins). Replace the name cell:
```html
          <td><button type="button" class="name-link" @click="router.push(`/app/lessor-profile/${r.id}`)">{{ r.name }}</button></td>
```
And add a style:
```css
.name-link { background: none; border: none; color: var(--accent-text); cursor: pointer; font: inherit; padding: 0; text-align: left; }
```

- [ ] **Step 6: Run the test + client suite**

Run: `cd client && npx vitest run tests/LessorProfileView.test.js` → PASS. Then `cd client && npx vitest run` → all pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/resource.js client/src/views/LessorProfileView.vue client/src/router/index.js client/src/views/OwnersView.vue client/tests/LessorProfileView.test.js
git commit -m "feat(lessor-profile): staff Lessor Profile page + Owners link"
```

---

### Task 3: Full verification

- [ ] **Step 1:** `cd server && npx vitest run` → all pass.
- [ ] **Step 2:** `cd client && npx vitest run` → all pass.
- [ ] **Step 3:** `npm --workspace client run build` → clean.
- [ ] **Step 4:** Manual smoke (server on :5050, staff): open **Owners** → click a lessor's name → the profile shows header, units, requirements summary, acceptance-form status, and recent activity; the "Review requirements →" link navigates to Lessor Requirements. (No schema/migration this sub-project.)

---

## Notes for the implementer

- No schema change / migration — this is read-only aggregation.
- Reuse `listForOwner` from F for the checklist; do not re-query requirements manually.
- The profile route and view are staff-only; the Owners list is already `requireStaff`, and making the name a link there is safe for all staff.
