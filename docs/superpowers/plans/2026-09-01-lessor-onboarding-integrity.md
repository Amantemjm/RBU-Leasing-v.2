# Lessor Onboarding Integrity (#3 + #4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-link a lessor's originating inquiry to their new account (#4), and make onboarding progress visible + gate acceptance-form approval on an approved unit + complete requirements (#3).

**Architecture:** Additive `Inquiry.convertedUserId` + `CONVERTED` enum value; signup best-effort links the newest matching open inquiry. The shared info-sheet service gains an optional `approveGuard`; the lessor router supplies one. The Lessor Profile computes an onboarding tracker and resolves the origin inquiry. Two client views surface it.

**Tech Stack:** Node/Express, Prisma/PostgreSQL, Zod, Vitest + Supertest, Vue 3, @vue/test-utils.

## Global Constraints

- Additive only; nullable column + additive enum value via idempotent SQL (dev + test), NOT `prisma migrate dev` (history diverged). Never truncate/drop. Subagents must never run prisma migrate/db push or touch the dev DB.
- Tests run against `rbu_leasing_test` only.
- Signup inquiry-linkage is **best-effort**: it must never make signup fail.
- The acceptance-form approval guard applies to the **lessor** sheet only; the lessee sheet is unchanged.
- Match values exactly: enum value `CONVERTED`; inquirerType↔role map `UNIT_OWNER→LESSOR`, `TENANT→LESSEE`; requirement "complete" = every item `status === "Approved"` (7 total).

---

### Task 1: Schema + migration (Inquiry.convertedUserId + CONVERTED enum)

**Files:**
- Modify: `server/prisma/schema.prisma` (`enum InquiryStatus`, `model Inquiry`, `model User`)
- Create: `server/prisma/manual-migrations/2026-09-01-inquiry-conversion.sql`

**Interfaces:**
- Produces: `InquiryStatus.CONVERTED`; `Inquiry.convertedUserId` + relation `convertedUser`; `User.convertedInquiries`.

> Controller-only task (DB migration + stops the dev server). If dispatched to a subagent, report BLOCKED.

- [ ] **Step 1: Edit the schema**

In `server/prisma/schema.prisma`:
- `enum InquiryStatus { NEW IN_PROGRESS CLOSED CONVERTED }` (add `CONVERTED`).
- In `model Inquiry`, add:
```prisma
  convertedUserId String?
  convertedUser   User?   @relation("InquiryConversion", fields: [convertedUserId], references: [id])
```
- In `model User`, add the back-relation:
```prisma
  convertedInquiries Inquiry[] @relation("InquiryConversion")
```

- [ ] **Step 2: Write the migration SQL**

Create `server/prisma/manual-migrations/2026-09-01-inquiry-conversion.sql`:
```sql
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "convertedUserId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_convertedUserId_fkey"
    FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
> The script only *adds* the value + column + FK; nothing in it *uses* `CONVERTED`, so the Postgres "can't use a new enum value in the same transaction" rule is not triggered.

- [ ] **Step 3: Stop the dev server, apply to dev + test, regenerate**
```bash
npx --yes kill-port 5050 || true
```
Then from `server/`:
```bash
npx prisma db execute --url "postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing?schema=public" --file prisma/manual-migrations/2026-09-01-inquiry-conversion.sql
npx prisma db execute --url "postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing_test?schema=public" --file prisma/manual-migrations/2026-09-01-inquiry-conversion.sql
npx prisma generate
```
Expected: both "Script executed successfully"; client regenerates.

- [ ] **Step 4: Verify**
```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.inquiry.findFirst({where:{convertedUserId:null}}).then(()=>console.log('convertedUserId OK')).catch(e=>console.log('ERR',e.message))"
```
Expected: `convertedUserId OK`.

- [ ] **Step 5: Commit**
```bash
git add server/prisma/schema.prisma server/prisma/manual-migrations/2026-09-01-inquiry-conversion.sql
git commit -m "feat(inquiry): convertedUserId + CONVERTED status (additive SQL)"
```

---

### Task 2: Signup links the originating inquiry

**Files:**
- Modify: `server/src/services/authService.js` (`signupPortalUser`)
- Test: `server/tests/authSignup.test.js` (extend; if it doesn't exist, create `server/tests/inquiryConversion.test.js`)

**Interfaces:**
- Consumes: `prisma`; the enum + column from Task 1.
- Produces: after a portal signup, the newest matching open inquiry becomes `CONVERTED` + `convertedUserId`.

- [ ] **Step 1: Write the failing tests**

Add tests (a new file `server/tests/inquiryConversion.test.js` is cleanest). Reuse `helpers.js`/`resetCrudTables`. Skeleton:
```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function inquiry(over = {}) {
  return prisma.inquiry.create({ data: {
    category: "RESIDENCES", inquirerType: "LESSOR", inquiryType: "List Unit for Lease",
    fullName: "Maria Santos", email: "maria@example.com", consent: true, status: "NEW", ...over } });
}
const signup = (over = {}) => request(app).post("/api/auth/signup").send({
  name: "Maria Santos", email: "maria@example.com", contactEmail: "maria@example.com",
  password: "Passw0rd!123", role: "UNIT_OWNER", consent: true, ...over });

describe("inquiry → account linkage on signup", () => {
  it("links the newest matching open LESSOR inquiry and marks it CONVERTED", async () => {
    const older = await inquiry({ createdAt: new Date("2026-08-01T00:00:00Z") });
    const newer = await inquiry({ createdAt: new Date("2026-08-20T00:00:00Z") });
    const res = await signup();
    expect(res.status).toBe(201);
    const userId = res.body.user.id;
    const a = await prisma.inquiry.findUnique({ where: { id: newer.id } });
    const b = await prisma.inquiry.findUnique({ where: { id: older.id } });
    expect(a.status).toBe("CONVERTED");
    expect(a.convertedUserId).toBe(userId);
    expect(b.status).toBe("NEW"); // only the newest is linked
  });

  it("signup with no matching inquiry still succeeds and changes nothing", async () => {
    const res = await signup({ email: "solo@example.com", contactEmail: "solo@example.com" });
    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count({ where: { status: "CONVERTED" } })).toBe(0);
  });

  it("does not link a LESSEE inquiry to a UNIT_OWNER signup", async () => {
    const lessee = await inquiry({ inquirerType: "LESSEE", inquiryType: "Unit Availability" });
    await signup();
    const still = await prisma.inquiry.findUnique({ where: { id: lessee.id } });
    expect(still.status).toBe("NEW");
  });

  it("ignores an already-converted/closed inquiry", async () => {
    await inquiry({ status: "CLOSED" });
    const res = await signup();
    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count({ where: { status: "CONVERTED" } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run — verify fail** (from `server/`) `npx vitest run tests/inquiryConversion.test.js` → FAIL.

- [ ] **Step 3: Implement the linkage**

In `server/src/services/authService.js`, inside `signupPortalUser`, after the `const user = await prisma.user.create({...})` and before the `return`, add:
```js
  // Best-effort: link the applicant's most recent open inquiry to this account so
  // the journey from first contact to onboarding is captured. Never fails signup.
  try {
    const inquirerType = role === "UNIT_OWNER" ? "LESSOR" : "LESSEE";
    const match = await prisma.inquiry.findFirst({
      where: { email: contactEmail, inquirerType, status: { in: ["NEW", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
    });
    if (match) {
      await prisma.inquiry.update({ where: { id: match.id }, data: { status: "CONVERTED", convertedUserId: user.id } });
    }
  } catch { /* linkage is best-effort */ }
```
> `contactEmail` is the applicant's real email (the inquiry's `email`); `email` is the login username. Match on `contactEmail`.

- [ ] **Step 4: Run — verify pass, then full server suite**
```bash
npx vitest run tests/inquiryConversion.test.js
npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add server/src/services/authService.js server/tests/inquiryConversion.test.js
git commit -m "feat(inquiry): auto-link the originating inquiry on portal signup"
```

---

### Task 3: Acceptance-form approval guard (lessor only)

**Files:**
- Modify: `server/src/lib/infoSheet.js` (`makeInfoSheetService`, `makeInfoSheetRouter`, `review`)
- Modify: `server/src/routes/lessorInfoSheetRoutes.js` (supply the guard)
- Test: `server/tests/lessorInfoSheets.test.js` (extend)

**Interfaces:**
- Consumes: `prisma`, `lessorRequirementService.listForOwner`.
- Produces: `makeInfoSheetService`/`Router` accept `approveGuard`; `review` calls it when approving. Lessor router supplies a guard requiring ≥1 approved unit + all requirements approved.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/lessorInfoSheets.test.js` (it already has `factory`, `tokens`, `requestFor`, `FILLED`, `BASE`). A helper to fully submit a sheet, then attempt approval under different prerequisite states:
```js
  async function submittedSheet(ownerId) {
    const s = await requestFor(ownerId);
    await request(app).patch(`${BASE}/${s.body.id}/submit`).set("Authorization", `Bearer ${tokens.owner(ownerId)}`).send({ data: FILLED });
    return s.body.id;
  }
  async function approveAllReqs(ownerId) {
    const { REQUIREMENT_KEYS } = await import("../../shared/lessorRequirements.js");
    for (const key of REQUIREMENT_KEYS) {
      await prisma.lessorRequirement.upsert({
        where: { unitOwnerId_requirementKey: { unitOwnerId: ownerId, requirementKey: key } },
        create: { unitOwnerId: ownerId, requirementKey: key, status: "Approved" },
        update: { status: "Approved" },
      });
    }
  }

  it("blocks acceptance-form approval without an approved unit (409)", async () => {
    const o = await factory.owner();
    const id = await submittedSheet(o.id);
    const res = await request(app).patch(`${BASE}/${id}/review`).set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(res.status).toBe(409);
  });

  it("blocks approval when requirements are incomplete (409), allows once complete", async () => {
    const o = await factory.owner();
    await factory.unit(o.id, { approvalStatus: "APPROVED" });
    const id = await submittedSheet(o.id);
    const blocked = await request(app).patch(`${BASE}/${id}/review`).set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(blocked.status).toBe(409);
    await approveAllReqs(o.id);
    const ok = await request(app).patch(`${BASE}/${id}/review`).set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("APPROVED");
  });

  it("RETURNED review is not gated by the guard", async () => {
    const o = await factory.owner();
    const id = await submittedSheet(o.id);
    const res = await request(app).patch(`${BASE}/${id}/review`).set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "RETURNED", remarks: "fix" });
    expect(res.status).toBe(200);
  });
```
> Confirm the `lessorRequirement` unique key name (`unitOwnerId_requirementKey`) against the schema's `@@unique([unitOwnerId, requirementKey])`; adjust the upsert `where` if Prisma named it differently. Also confirm `REQUIREMENT_KEYS` is exported from `shared/lessorRequirements.js`.

Also add to `server/tests/lesseeInfoSheets.test.js` a guard-free check (lessee approval still works with no units/requirements):
```js
  it("lessee acceptance-form approval is not gated by lessor prerequisites", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id); // use this file's helper name
    await request(app).patch(`${BASE}/${s.body.id}/submit`).set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ data: FILLED });
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`).set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(res.status).toBe(200);
  });
```
> Match the lessee test file's actual helper/fixture names.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/lessorInfoSheets.test.js -t "approval"` → FAIL (approval currently succeeds → 200, test expects 409).

- [ ] **Step 3: Add the `approveGuard` hook to the shared service**

In `server/src/lib/infoSheet.js`:
- Change the service signature to accept `approveGuard`:
```js
export function makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField, version = null, approveGuard = null }) {
```
- In `review`, call the guard when approving (before the update):
```js
  async function review(actor, id, { status, remarks }) {
    const sheet = await get(id);
    if (status === "APPROVED" && approveGuard) await approveGuard(sheet[fkField]);
    const reviewedByName = await resolveName(actor);
    return model.update({ where: { id }, data: { status, remarks: remarks ?? null, reviewedAt: new Date(), reviewedByName }, ...readOpts });
  }
```
> `get(id)` already loads the sheet (with the relation); reuse it to read `sheet[fkField]` (the owner/tenant id).
- Change `makeInfoSheetRouter` to accept + forward `approveGuard`:
```js
export function makeInfoSheetRouter({ model, parentModel, fkField, ownerRole, relationName, config, submitSchema, title, filePrefix, pdfRenderer, binaryField, approveGuard = null }) {
  const service = makeInfoSheetService({ model, parentModel, fkField, ownerRole, relationName, binaryField, version: config?.version || null, approveGuard });
```

- [ ] **Step 4: Supply the lessor guard**

In `server/src/routes/lessorInfoSheetRoutes.js`, import prisma + the requirement service, define the guard, and pass it:
```js
import { prisma } from "../lib/prisma.js";           // (already imported)
import { listForOwner } from "../services/lessorRequirementService.js";
import { ConflictError } from "../lib/errors.js";

async function lessorAcceptanceGuard(unitOwnerId) {
  const approvedUnits = await prisma.unit.count({ where: { ownerId: unitOwnerId, approvalStatus: "APPROVED" } });
  if (approvedUnits === 0) throw new ConflictError("The lessor needs at least one approved unit before the acceptance form can be approved");
  const reqs = await listForOwner(unitOwnerId);
  const approved = reqs.filter((r) => r.status === "Approved").length;
  if (approved < reqs.length) throw new ConflictError(`All requirements must be approved first (${approved}/${reqs.length})`);
}
```
Add `approveGuard: lessorAcceptanceGuard,` to the `makeInfoSheetRouter({ ... })` call. Confirm `listForOwner` is exported from `lessorRequirementService.js` (F). Do NOT add a guard to `lesseeInfoSheetRoutes.js`.

- [ ] **Step 5: Run — verify pass, then full server suite**
```bash
npx vitest run tests/lessorInfoSheets.test.js tests/lesseeInfoSheets.test.js
npx vitest run
```

- [ ] **Step 6: Commit**
```bash
git add server/src/lib/infoSheet.js server/src/routes/lessorInfoSheetRoutes.js server/tests/lessorInfoSheets.test.js server/tests/lesseeInfoSheets.test.js
git commit -m "feat(acceptance-form): gate lessor approval on approved unit + complete requirements"
```

---

### Task 4: Onboarding tracker + origin inquiry in the profile

**Files:**
- Modify: `server/src/services/lessorProfileService.js`
- Test: `server/tests/lessorProfile.test.js` (extend)

**Interfaces:**
- Produces: `profile.onboarding = { steps[], stage, percent }` and `profile.originInquiry = { id, inquiryType, createdAt } | null`.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/lessorProfile.test.js` (match its helpers). Skeleton:
```js
  it("returns an onboarding tracker reflecting progress", async () => {
    const o = await factory.owner({ name: "Track Owner" });
    await factory.unit(o.id, { approvalStatus: "APPROVED" });
    const res = await request(app).get(`/api/owners/${o.id}/profile`).set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    const ob = res.body.onboarding;
    expect(ob.steps.find((s) => s.key === "units").done).toBe(true);
    expect(ob.steps.find((s) => s.key === "requirements").done).toBe(false); // none approved
    expect(ob.stage).toBe("Requirements complete"); // first not-done after account+units
    expect(ob.percent).toBe(50); // account + units done of 4
  });

  it("exposes the originating inquiry linked to the owner's account", async () => {
    const o = await factory.owner({ name: "Origin Owner", email: "origin@example.com" });
    // a user linked to this owner, and an inquiry converted to that user
    const u = await prisma.user.create({ data: { name: "Origin Owner", email: "originlogin", contactEmail: "origin@example.com", role: "UNIT_OWNER", passwordHash: "x", status: "APPROVED", unitOwnerId: o.id } });
    const inq = await prisma.inquiry.create({ data: { category: "RESIDENCES", inquirerType: "LESSOR", inquiryType: "List Unit for Lease", fullName: "Origin Owner", email: "origin@example.com", consent: true, status: "CONVERTED", convertedUserId: u.id } });
    const res = await request(app).get(`/api/owners/${o.id}/profile`).set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.body.originInquiry?.id).toBe(inq.id);
    expect(res.body.originInquiry?.inquiryType).toBe("List Unit for Lease");
  });
```
> Confirm `User` required fields (`passwordHash`) against the schema; adjust the create.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/lessorProfile.test.js -t "onboarding"` → FAIL.

- [ ] **Step 3: Implement**

In `server/src/services/lessorProfileService.js`:
- Extend the owner load's `users` select to include `id` (needed to resolve the origin inquiry):
  the include already selects `users: { select: { contactEmail: true, status: true }, take: 1 }` — change to `select: { id: true, contactEmail: true, status: true }`.
- After computing `requirements`/`approved`/`sheet`, add:
```js
  const approvedUnits = owner.units.filter((u) => u.approvalStatus === "APPROVED").length;
  const reqTotal = requirements.length;
  const steps = [
    { key: "account",        label: "Account approved",         done: true },
    { key: "units",          label: "Unit approved",            done: approvedUnits >= 1, detail: `${approvedUnits} approved` },
    { key: "requirements",   label: "Requirements complete",    done: reqTotal > 0 && approved === reqTotal, detail: `${approved} of ${reqTotal}` },
    { key: "acceptanceForm", label: "Acceptance form approved", done: sheet?.status === "APPROVED", detail: sheet?.status || "Not started" },
  ];
  const firstOutstanding = steps.find((s) => !s.done);
  const onboarding = {
    steps,
    stage: firstOutstanding ? firstOutstanding.label : "Complete",
    percent: Math.round(steps.filter((s) => s.done).length / steps.length * 100),
  };
  const userId = owner.users[0]?.id || null;
  let originInquiry = null;
  if (userId) {
    const inq = await prisma.inquiry.findFirst({ where: { convertedUserId: userId }, orderBy: { createdAt: "desc" }, select: { id: true, inquiryType: true, createdAt: true } });
    if (inq) originInquiry = inq;
  }
```
- Add `onboarding` and `originInquiry` to the returned object.

- [ ] **Step 4: Run — verify pass, then full server suite**
```bash
npx vitest run tests/lessorProfile.test.js
npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add server/src/services/lessorProfileService.js server/tests/lessorProfile.test.js
git commit -m "feat(lessor-profile): onboarding tracker + originating inquiry"
```

---

### Task 5: Lessor Profile view — onboarding panel + inquiry line

**Files:**
- Modify: `client/src/views/LessorProfileView.vue`
- Test: `client/tests/LessorProfileView.test.js` (extend)

**Interfaces:**
- Consumes: `profile.onboarding`, `profile.originInquiry`.

- [ ] **Step 1: Extend the test**

In `client/tests/LessorProfileView.test.js`, add `onboarding` + `originInquiry` to the mocked profile fixture and assert they render:
```js
    onboarding: { stage: "Requirements complete", percent: 50, steps: [
      { key: "account", label: "Account approved", done: true },
      { key: "units", label: "Unit approved", done: true, detail: "1 approved" },
      { key: "requirements", label: "Requirements complete", done: false, detail: "2 of 7" },
      { key: "acceptanceForm", label: "Acceptance form approved", done: false, detail: "Not started" },
    ] },
    originInquiry: { id: "i1", inquiryType: "List Unit for Lease", createdAt: "2026-08-01T00:00:00.000Z" },
```
Assertions: `expect(w.text()).toContain("Requirements complete")` and `expect(w.text()).toContain("List Unit for Lease")` and a step label like "Unit approved". Match the file's fixture/mount style; keep existing assertions.

- [ ] **Step 2: Run — verify fail** (from `client/`) `npx vitest run tests/LessorProfileView.test.js` → FAIL.

- [ ] **Step 3: Implement**

In `client/src/views/LessorProfileView.vue`, add an **Onboarding** panel near the top (before or beside the header/units), rendering `p.onboarding`:
- The `stage` + a small progress bar for `percent` (a simple `<div>` width:`percent%`), and the four `steps` as a list with a done indicator (✓ / ○) + `label` + muted `detail`.
- Add an "Originating inquiry" line where the header/account info is shown: `v-if="p.originInquiry"` → `{{ p.originInquiry.inquiryType }} · {{ formatDate(p.originInquiry.createdAt) }}`.
Guard with `v-if="p.onboarding"`. Keep additive; scoped styles + existing tokens.

- [ ] **Step 4: Run — verify pass, full client suite** `npx vitest run tests/LessorProfileView.test.js` then `npx vitest run`.

- [ ] **Step 5: Commit**
```bash
git add client/src/views/LessorProfileView.vue client/tests/LessorProfileView.test.js
git commit -m "feat(lessor-profile): onboarding panel + originating-inquiry line"
```

---

### Task 6: Inquiries view — Status column with Converted badge

**Files:**
- Modify: `client/src/views/InquiriesView.vue`
- Test: `client/tests/InquiriesView.test.js` (extend)

**Interfaces:**
- Consumes: `row.status` (now includes `CONVERTED`).

- [ ] **Step 1: Extend the test**

In `client/tests/InquiriesView.test.js`, ensure a mocked inquiry has `status: "CONVERTED"` and assert a "Converted" badge renders; also assert a normal status (e.g. "New") renders. Match the file's mock/mount harness.

- [ ] **Step 2: Run — verify fail** (from `client/`) `npx vitest run tests/InquiriesView.test.js` → FAIL.

- [ ] **Step 3: Implement**

In `client/src/views/InquiriesView.vue`:
- Add a `<th>Status</th>` to the header (after "Received" or before "Assigned to"), and a `<td>` per row rendering a status badge: a `STATUS_LABEL` map `{ NEW:"New", IN_PROGRESS:"In Progress", CLOSED:"Closed", CONVERTED:"Converted" }` → `<span :class="['status-tag', r.status.toLowerCase()]">{{ STATUS_LABEL[r.status] || r.status }}</span>`.
- **Update the empty-state colspan** (currently `canWrite ? 9 : 8`) to `canWrite ? 10 : 9` to account for the new column.
- Add scoped `.status-tag` styles (mirror the badge styling used in `InfoSheetsStaff.vue`), with a distinct look for `.converted` (e.g. brand-green/`--good`).

- [ ] **Step 4: Run — verify pass, full client suite** `npx vitest run tests/InquiriesView.test.js` then `npx vitest run`.

- [ ] **Step 5: Commit**
```bash
git add client/src/views/InquiriesView.vue client/tests/InquiriesView.test.js
git commit -m "feat(inquiries): status column with Converted badge"
```

---

## Self-Review

**Spec coverage:** enum+column+FK (T1) ✓; signup linkage w/ newest-match, type-match, best-effort, no-match (T2) ✓; approveGuard hook + lessor guard + lessee-unaffected (T3) ✓; onboarding tracker + originInquiry (T4) ✓; profile panel + inquiry line (T5) ✓; inquiries Converted badge (T6) ✓.

**Type consistency:** `approveGuard` added to `makeInfoSheetService` + `makeInfoSheetRouter` + `review` (T3) and supplied only by the lessor router; `onboarding`/`originInquiry` produced in T4 and consumed in T5; `CONVERTED` used consistently (server set in T2, displayed in T6). `contactEmail` (not `email`) is the match key. Requirement "complete" = all `Approved`.

**Adaptation points flagged inline:** lessorRequirement unique-key name + `REQUIREMENT_KEYS` export (T3), lessee test helper names (T3), `User` required fields in the profile test (T4), client fixture/mount styles (T5/T6), and the empty-state colspan bump (T6).

**Migration caveat:** enum value + column via idempotent SQL, not a migrate file; deploys run the SQL per environment.
