# Acceptance Form Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record and display who submitted an Acceptance Form (info sheet), who reviewed it, and which form version it used — for both the Lessor and Lessee sheets.

**Architecture:** Add three nullable columns (`submittedByName`, `reviewedByName`, `formVersion`) to both info-sheet tables. The shared `makeInfoSheetService`/`makeInfoSheetRouter` (`server/src/lib/infoSheet.js`) stamps `submittedByName` + `formVersion` at submit time and `reviewedByName` at review time, resolving names from the acting user. Each config carries a `version` constant. Staff sheet view and the Lessor Profile display the metadata.

**Tech Stack:** Node/Express, Prisma/PostgreSQL, Vitest + Supertest (server), Vitest + @vue/test-utils (client), Vue 3.

## Global Constraints

- Migrations are additive and reversible-safe; all new columns are **nullable** (existing rows unaffected). Never truncate or drop.
- Tests run against `rbu_leasing_test` only (guarded by `server/tests/setup.env.js`). Never point tests at the dev DB.
- The dev server locks Prisma's generated client DLL on Windows — **stop any running server before `prisma migrate`/`generate`**.
- Form version constant for this release: `"2026-08"`.
- Don't change the two submission methods (fill in-system / upload PDF), status values, or review flow — metadata is purely additive.

---

### Task 1: Schema + migration for the three metadata columns

**Files:**
- Modify: `server/prisma/schema.prisma` (models `LessorInfoSheet` ~line 120, `LesseeInfoSheet` ~line 134)
- Create: `server/prisma/migrations/<generated>/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Produces: columns `submittedByName String?`, `reviewedByName String?`, `formVersion String?` on both `LessorInfoSheet` and `LesseeInfoSheet`, available on the Prisma client.

- [ ] **Step 1: Add the columns to both models**

In `server/prisma/schema.prisma`, in `model LessorInfoSheet`, add these three lines right after `remarks     String?`:

```prisma
  submittedByName String?
  reviewedByName  String?
  formVersion     String?
```

Add the identical three lines to `model LesseeInfoSheet`, right after its `remarks     String?` line.

- [ ] **Step 2: Ensure no dev server is holding the Prisma client**

Run (PowerShell): stop any running server process on port 5050 first (Ctrl-C in its terminal, or):

```bash
npx --yes kill-port 5050 || true
```

Expected: port free (command succeeds or reports nothing to kill).

- [ ] **Step 3: Create and apply the migration**

Run from `server/`:

```bash
npx prisma migrate dev --name acceptance_form_metadata
```

Expected: a new migration folder is created; output ends with "Your database is now in sync with your schema" and the Prisma client regenerates. The generated `migration.sql` should contain six `ALTER TABLE ... ADD COLUMN` statements (three per table), all nullable.

- [ ] **Step 4: Verify the client has the fields**

Run from `server/`:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.lessorInfoSheet.fields&&console.log(Object.keys(p.lessorInfoSheet.fields).filter(k=>/submittedByName|reviewedByName|formVersion/.test(k)))"
```

Expected: prints `[ 'submittedByName', 'reviewedByName', 'formVersion' ]` (order may vary).

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(info-sheets): add submittedByName/reviewedByName/formVersion columns"
```

---

### Task 2: Config version + service stamping + review actor

**Files:**
- Modify: `server/src/config/lessorInfoSheet.js:11` (add `version`)
- Modify: `server/src/config/lesseeInfoSheet.js:4` (add `version`)
- Modify: `server/src/lib/infoSheet.js` (service + router)
- Test: `server/tests/lessorInfoSheets.test.js`, `server/tests/lesseeInfoSheets.test.js`

**Interfaces:**
- Consumes: Prisma columns from Task 1; `prisma` from `./prisma.js`; `req.user` = `{ userId, role, unitOwnerId, tenantId }` (from `verifyJwt`).
- Produces: `submit`/`submitPdf` stamp `submittedByName` + `formVersion`; `review(actor, id, {status, remarks})` stamps `reviewedByName`. Config objects gain `version: "2026-08"`.

- [ ] **Step 1: Add the failing server tests (lessor)**

In `server/tests/lessorInfoSheets.test.js`, add these tests inside the `describe("Lessor Information Sheets", ...)` block (after the existing "owner submits with valid data" test). Note the review test creates a **real** staff user so the reviewer's name resolves:

```js
  it("stamps submittedByName (owner) and formVersion on submit", async () => {
    const o = await factory.owner({ name: "Ayala Land" });
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ data: FILLED });
    expect(res.status).toBe(200);
    expect(res.body.submittedByName).toBe("Ayala Land");
    expect(res.body.formVersion).toBe("2026-08");
  });

  it("stamps reviewedByName from the reviewing officer", async () => {
    const { prisma } = await import("../src/lib/prisma.js");
    const reviewer = await prisma.user.create({
      data: { name: "Officer Jane", email: "jane.officer@example.com", password: "x", role: "LEASING_OFFICER" },
    });
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.officer(reviewer.id)}`).send({ status: "APPROVED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.reviewedByName).toBe("Officer Jane");
  });
```

This test calls `tokens.officer(reviewer.id)` — a form that doesn't exist yet. Extend the helper in `server/tests/helpers.js`: change the `officer` entry to accept an optional id:

```js
  officer: (id = "test-officer") => issueToken({ id, role: "LEASING_OFFICER" }),
```

(Existing `tokens.officer()` callers keep working via the default.)

> If `User.password` is not the correct column name, open `server/prisma/schema.prisma` `model User` and use its actual required fields; the point is a real staff row whose `id` matches the token's `userId`.

- [ ] **Step 2: Run the new lessor tests — verify they fail**

Run from `server/`:

```bash
npx vitest run tests/lessorInfoSheets.test.js -t "stamps"
```

Expected: FAIL — `submittedByName`/`formVersion`/`reviewedByName` are `null` (columns exist but nothing stamps them).

- [ ] **Step 3: Add `version` to both configs**

In `server/src/config/lessorInfoSheet.js`, change the object opening so `title` is followed by `version`:

```js
export default {
  title: "Unit Owner Information Sheet",
  version: "2026-08",
```

In `server/src/config/lesseeInfoSheet.js`:

```js
export default {
  title: "Lessee Information Sheet",
  version: "2026-08",
```

- [ ] **Step 4: Implement stamping in the shared service**

In `server/src/lib/infoSheet.js`:

(a) Add the prisma import at the top, after the existing imports:

```js
import { prisma } from "./prisma.js";
```

(b) Change the service factory signature to accept `version` and add a `resolveName` helper. Replace the `makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField })` line and the two lines under it with:

```js
export function makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField, version = null }) {
  const include = { [relationName]: { select: { id: true, name: true } } };
  const readOpts = binaryField ? { include, omit: { [binaryField]: true } } : { include };

  // Best-effort display name for the acting user: login user -> owner -> tenant.
  async function resolveName(user) {
    if (!user) return null;
    if (user.userId) {
      const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, email: true } });
      if (u) return u.name || u.email || null;
    }
    if (user.unitOwnerId) {
      const o = await prisma.unitOwner.findUnique({ where: { id: user.unitOwnerId }, select: { name: true } });
      if (o) return o.name || null;
    }
    if (user.tenantId) {
      const t = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } });
      if (t) return t.name || null;
    }
    return null;
  }
```

(c) In `submit(user, id, data)`, replace the `return model.update(...)` line with one that stamps the metadata:

```js
    const submittedByName = await resolveName(user);
    return model.update({ where: { id }, data: { data, ...extra, status: "SUBMITTED", submittedAt: new Date(), submittedByName, formVersion: version }, ...readOpts });
```

(d) In `submitPdf(user, id, buffer)`, replace its `return model.update(...)` line with:

```js
    const submittedByName = await resolveName(user);
    return model.update({ where: { id }, data: { [binaryField]: buffer, status: "SUBMITTED", submittedAt: new Date(), submittedByName, formVersion: version }, ...readOpts });
```

(e) Change `review` to accept an actor and stamp `reviewedByName`:

```js
  async function review(actor, id, { status, remarks }) {
    await get(id);
    const reviewedByName = await resolveName(actor);
    return model.update({ where: { id }, data: { status, remarks: remarks ?? null, reviewedAt: new Date(), reviewedByName }, ...readOpts });
  }
```

- [ ] **Step 5: Wire the router to pass version + the review actor**

In `server/src/lib/infoSheet.js`, in `makeInfoSheetRouter`, change the service construction to forward the config version:

```js
  const service = makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField, version: config?.version || null });
```

And in the `PATCH /:id/review` handler, pass `req.user`:

```js
      res.json(await service.review(req.user, req.params.id, { status, remarks }));
```

- [ ] **Step 6: Add the failing/now-passing lessee test**

In `server/tests/lesseeInfoSheets.test.js`, add a submit test that asserts stamping (mirror the lessee file's existing submit test for the exact `BASE`, filled-data fixture, and tenant-token helper it already uses — reuse those, only adding the two assertions):

```js
  it("stamps submittedByName (tenant) and formVersion on submit", async () => {
    const t = await factory.tenant({ name: "Juan Tenant" });
    const s = await requestForTenant(t.id); // use whatever request helper this file already defines
    const res = await request(app).patch(`${LESSEE_BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ data: LESSEE_FILLED });
    expect(res.status).toBe(200);
    expect(res.body.submittedByName).toBe("Juan Tenant");
    expect(res.body.formVersion).toBe("2026-08");
  });
```

> Open `server/tests/lesseeInfoSheets.test.js` first and match its existing constants (`BASE`, filled fixture name, request helper). Do not invent names — reuse the file's.

- [ ] **Step 7: Run the info-sheet suites — verify pass**

Run from `server/`:

```bash
npx vitest run tests/lessorInfoSheets.test.js tests/lesseeInfoSheets.test.js
```

Expected: PASS (all existing tests plus the new stamping tests).

- [ ] **Step 8: Run the full server suite — no regressions**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/infoSheet.js server/src/config/lessorInfoSheet.js server/src/config/lesseeInfoSheet.js server/tests/lessorInfoSheets.test.js server/tests/lesseeInfoSheets.test.js server/tests/helpers.js
git commit -m "feat(info-sheets): stamp submittedByName/formVersion on submit and reviewedByName on review"
```

---

### Task 3: Surface submittedByName + formVersion in the Lessor Profile

**Files:**
- Modify: `server/src/services/lessorProfileService.js:15-18` (sheet select) and `:45` (acceptanceForm shape)
- Test: `server/tests/lessorProfile.test.js`

**Interfaces:**
- Consumes: the new `LessorInfoSheet` columns.
- Produces: `profile.acceptanceForm` gains `submittedByName` and `formVersion`.

- [ ] **Step 1: Add the failing test**

In `server/tests/lessorProfile.test.js`, add a test that a submitted acceptance form's metadata appears in the profile. Match the file's existing setup helpers (owner factory, submit path). Skeleton:

```js
  it("acceptanceForm includes submittedByName and formVersion", async () => {
    const o = await factory.owner({ name: "Profile Owner" });
    const s = await request(app).post("/api/lessor-info-sheets")
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ unitOwnerId: o.id });
    await request(app).patch(`/api/lessor-info-sheets/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`)
      .send({ data: { lastName: "X", firstName: "Y", mobile: "09170000000", email: "x@y.com",
        estate: "Capitol Commons", buildingName: "Maven", unitNumber: "1A", sex: "Male",
        civilStatus: "Single", preferredChannel: ["Email"], leaseTermPeriod: "Long Term (1 year and above)" } });
    const res = await request(app).get(`/api/owners/${o.id}/profile`).set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    expect(res.body.acceptanceForm.submittedByName).toBe("Profile Owner");
    expect(res.body.acceptanceForm.formVersion).toBe("2026-08");
  });
```

> Confirm the info-sheet mount path (`/api/lessor-info-sheets`) and the required submit fields against `server/tests/lessorInfoSheets.test.js`'s `FILLED` fixture; reuse that fixture if importable, else inline the minimal valid set as above.

- [ ] **Step 2: Run it — verify it fails**

```bash
npx vitest run tests/lessorProfile.test.js -t "submittedByName"
```

Expected: FAIL — `acceptanceForm.submittedByName` is `undefined` (not selected/returned).

- [ ] **Step 3: Select and return the new fields**

In `server/src/services/lessorProfileService.js`, extend the `lessorInfoSheets` select:

```js
      lessorInfoSheets: {
        select: { status: true, submittedAt: true, reviewedAt: true, submittedByName: true, formVersion: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 1,
      },
```

And extend the `acceptanceForm` shape in the return:

```js
    acceptanceForm: sheet ? { status: sheet.status, submittedAt: sheet.submittedAt, reviewedAt: sheet.reviewedAt, submittedByName: sheet.submittedByName, formVersion: sheet.formVersion } : null,
```

- [ ] **Step 4: Run the profile suite — verify pass**

```bash
npx vitest run tests/lessorProfile.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/lessorProfileService.js server/tests/lessorProfile.test.js
git commit -m "feat(lessor-profile): expose acceptance form submittedByName and formVersion"
```

---

### Task 4: Display metadata in the staff sheet view

**Files:**
- Modify: `client/src/components/InfoSheetsStaff.vue` (modal body, ~line 122-135)
- Create: `client/tests/InfoSheetsStaff.test.js`

**Interfaces:**
- Consumes: sheet rows now carry `submittedByName`, `reviewedByName`, `formVersion`.
- Produces: the review/view modal shows a metadata block.

- [ ] **Step 1: Write the failing client test**

Create `client/tests/InfoSheetsStaff.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import InfoSheetsStaff from "../src/components/InfoSheetsStaff.vue";

const CONFIG = { title: "T", sections: [{ title: "A", fields: [{ key: "lastName", label: "Last name", type: "text" }] }] };
const ROW = {
  id: "s1", status: "APPROVED", submittedAt: "2026-08-21T00:00:00.000Z", reviewedAt: "2026-08-22T00:00:00.000Z",
  submittedByName: "Ayala Land", reviewedByName: "Officer Jane", formVersion: "2026-08",
  data: { lastName: "Reyes" }, unitOwner: { id: "o1", name: "Ayala Land" },
};

function makeClient() {
  return {
    list: vi.fn(() => Promise.resolve([ROW])),
    config: vi.fn(() => Promise.resolve(CONFIG)),
    create: vi.fn(),
    review: vi.fn(() => Promise.resolve({})),
    filledPdfUrl: vi.fn(() => Promise.reject(new Error("404"))), // submitted as structured data
    downloadFilledPdf: vi.fn(),
    downloadPdf: vi.fn(),
  };
}

describe("InfoSheetsStaff metadata", () => {
  it("shows submitted-by, reviewed-by, and form version in the modal", async () => {
    const client = makeClient();
    const w = mount(InfoSheetsStaff, { props: {
      client, parentList: () => Promise.resolve([{ id: "o1", name: "Ayala Land" }]),
      parentKey: "unitOwner", parentLabel: "Owner", filePrefix: "UnitOwnerAcceptanceForm", title: "Lessor Sheets",
    } });
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "View").trigger("click");
    await flushPromises();
    const text = w.text();
    expect(text).toContain("Ayala Land");
    expect(text).toContain("Officer Jane");
    expect(text).toContain("2026-08");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run from `client/`:

```bash
npx vitest run tests/InfoSheetsStaff.test.js
```

Expected: FAIL — "Officer Jane" / "2026-08" not found (metadata not rendered).

- [ ] **Step 3: Render the metadata block in the modal**

In `client/src/components/InfoSheetsStaff.vue`, inside the modal, add a metadata block after the sheet body and before the remarks `<div v-if="active.status === 'SUBMITTED'">`. Insert right after the `<ConfigurableForm ... />` line (line ~128):

```html
        <dl class="meta">
          <template v-if="active.submittedByName || active.submittedAt">
            <dt>Submitted by</dt><dd>{{ active.submittedByName || "—" }}<span v-if="active.submittedAt" class="muted"> · {{ formatDate(active.submittedAt) }}</span></dd>
          </template>
          <template v-if="active.reviewedByName || active.reviewedAt">
            <dt>Reviewed by</dt><dd>{{ active.reviewedByName || "—" }}<span v-if="active.reviewedAt" class="muted"> · {{ formatDate(active.reviewedAt) }}</span></dd>
          </template>
          <template v-if="active.formVersion">
            <dt>Form version</dt><dd>{{ active.formVersion }}</dd>
          </template>
        </dl>
```

Add matching styles inside the `<style scoped>` block:

```css
.meta { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.75rem; margin: 0.75rem 0; font-size: 0.85rem; }
.meta dt { color: var(--muted); font-weight: 600; }
.meta dd { margin: 0; }
```

- [ ] **Step 4: Run it — verify pass**

```bash
npx vitest run tests/InfoSheetsStaff.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/InfoSheetsStaff.vue client/tests/InfoSheetsStaff.test.js
git commit -m "feat(info-sheets): show submitted-by/reviewed-by/version in staff sheet modal"
```

---

### Task 5: Display submitted-by + version in the Lessor Profile view

**Files:**
- Modify: `client/src/views/LessorProfileView.vue:55-58` (Acceptance Form panel)
- Test: `client/tests/LessorProfileView.test.js`

**Interfaces:**
- Consumes: `p.acceptanceForm.submittedByName`, `p.acceptanceForm.formVersion` (from Task 3).

- [ ] **Step 1: Extend the existing test**

Open `client/tests/LessorProfileView.test.js`. Find the mocked profile fixture's `acceptanceForm` and add `submittedByName` + `formVersion`; then assert they render. If the fixture's `acceptanceForm` is `{ status, submittedAt }`, extend to:

```js
    acceptanceForm: { status: "SUBMITTED", submittedAt: "2026-08-21T00:00:00.000Z", submittedByName: "Ayala Land", formVersion: "2026-08" },
```

And in the render assertions, add:

```js
    expect(w.text()).toContain("Ayala Land");
    expect(w.text()).toContain("2026-08");
```

> Match the file's actual fixture/mount style; only add the two fields and two assertions.

- [ ] **Step 2: Run it — verify it fails**

Run from `client/`:

```bash
npx vitest run tests/LessorProfileView.test.js
```

Expected: FAIL — the new strings aren't rendered yet.

- [ ] **Step 3: Render submitted-by + version in the Acceptance Form panel**

In `client/src/views/LessorProfileView.vue`, replace the acceptance-form paragraph (lines ~56-57) with one that includes the metadata:

```html
      <p v-if="p.acceptanceForm"><span class="badge">{{ p.acceptanceForm.status }}</span>
        <span v-if="p.acceptanceForm.submittedByName" class="muted small"> · by {{ p.acceptanceForm.submittedByName }}</span>
        <span v-if="p.acceptanceForm.submittedAt" class="muted small"> · submitted {{ formatDate(p.acceptanceForm.submittedAt) }}</span>
        <span v-if="p.acceptanceForm.formVersion" class="muted small"> · v{{ p.acceptanceForm.formVersion }}</span></p>
```

- [ ] **Step 4: Run it — verify pass**

```bash
npx vitest run tests/LessorProfileView.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the full client suite — no regressions**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/LessorProfileView.vue client/tests/LessorProfileView.test.js
git commit -m "feat(lessor-profile): show acceptance form submitted-by and version"
```

---

## Self-Review

**Spec coverage:**
- Schema: 3 cols × 2 tables → Task 1. ✓
- Config version → Task 2 Step 3. ✓
- Service submit/submitPdf stamp submittedByName + formVersion → Task 2 Step 4. ✓
- review(actor) stamps reviewedByName; router passes req.user → Task 2 Steps 4-5. ✓
- Display in staff sheet view → Task 4. ✓
- Display in Lessor Profile (server + client) → Tasks 3, 5. ✓
- Tests for both lessor and lessee sheets → Task 2 (lessor + lessee), Task 3 (profile). ✓

**Type consistency:** `resolveName(user)` used in submit/submitPdf/review; `review(actor, id, {status, remarks})` signature matched by the router call in Task 2 Step 5; `version` param defaults to null and is fed from `config.version`. `acceptanceForm` gains `submittedByName`/`formVersion` consistently in server (Task 3) and client (Task 5).

**Known adaptation points flagged for the implementer:** the exact `User` create fields (Task 2 Step 1), the lessee test's existing constants (Task 2 Step 6), and the profile/client test fixtures (Tasks 3, 5) must be matched to the real files rather than assumed — each such step says so inline.
