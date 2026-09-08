# Capture Unit of Interest on Lessee Inquiries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the unit id from the public "Inquire about this unit" CTA through the inquiry, persist it, show it to staff, and pre-fill the transaction's unit + lessor links when an officer accepts (officer can override).

**Architecture:** Add a nullable `Inquiry.unitId` FK. The public inquiry form passes it; the create endpoint stores it only if it resolves to a real unit. Staff reads include a unit summary; `ensureForInquiry` (accept) pre-links the unit and derives the lessor from `unit.ownerId`, logging a warning if the unit is no longer available.

**Tech Stack:** Node/Express + Prisma (PostgreSQL) server; Vue 3 (Vite) client; Vitest + supertest tests.

## Global Constraints

- Schema changes apply via **idempotent SQL** in `server/prisma/manual-migrations/`, run against **dev (`rbu_leasing`) + test (`rbu_leasing_test`)**, then `prisma generate`. NEVER `prisma migrate dev` / `db push`.
- The feature is **optional/additive**: with no `unitId`, every path behaves exactly as today.
- Category prefill default when arriving with a unit is **`RESIDENCES`** (overridable by the lessee).
- An invalid/stale `unitId` at submit is stored as **`null`** and never blocks the inquiry.
- The `Inquiry.unitId` FK uses **`onDelete: SetNull`**.
- The lessor pre-link is a **snapshot** of `unit.ownerId` at accept; the officer can override via the existing Link editor.

---

### Task 1: Schema — add `Inquiry.unitId`

**Files:**
- Create: `server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql`
- Modify: `server/prisma/schema.prisma` (the `Inquiry` model and the `Unit` model)
- Test: `server/tests/inquiryUnit.test.js` (new)

**Interfaces:**
- Produces: `Inquiry.unitId` (nullable String), Prisma relations `Inquiry.unit` and `Unit.inquiries`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/inquiryUnit.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

beforeEach(async () => { await resetCrudTables(); });

async function ownerAndUnit() {
  const owner = await prisma.unitOwner.create({ data: { name: "OLZ", email: "olz@test.sim" } });
  const unit = await prisma.unit.create({ data: { ownerId: owner.id, unitNumber: "15-08", type: "2 Bedrooms", baseRent: 85000, status: "VACANT" } });
  return { owner, unit };
}

describe("Inquiry.unitId column", () => {
  it("stores and reads back a unitId on an inquiry", async () => {
    const { unit } = await ownerAndUnit();
    const inq = await prisma.inquiry.create({ data: {
      category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
      fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW", unitId: unit.id,
    } });
    const read = await prisma.inquiry.findUnique({ where: { id: inq.id } });
    expect(read.unitId).toBe(unit.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: FAIL — Prisma rejects `Unknown argument \`unitId\`` (column/relation not in the client yet).

- [ ] **Step 3: Add the SQL migration**

Create `server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql`:

```sql
-- Optional link from an inquiry to the specific unit the lessee is inquiring
-- about. Additive and idempotent, in line with the other manual migrations here
-- — the committed Prisma history has drifted on the deployed databases.
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Edit `schema.prisma`**

In the `model Inquiry { ... }` block, add these two lines (next to the other relations, before `createdAt`):

```prisma
  unit         Unit?           @relation(fields: [unitId], references: [id], onDelete: SetNull)
  unitId       String?
```

In the `model Unit { ... }` block, add the reverse relation (next to `leasingTransactions`):

```prisma
  inquiries           Inquiry[]
```

- [ ] **Step 5: Apply the migration to both databases and regenerate the client**

Run:

```bash
cd "server"
DEV_URL=$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
TEST_URL=$(grep -E '^DATABASE_URL=' .env.test | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
npx prisma db execute --url "$DEV_URL" --file prisma/manual-migrations/2026-09-08-inquiry-unit.sql
npx prisma db execute --url "$TEST_URL" --file prisma/manual-migrations/2026-09-08-inquiry-unit.sql
npx prisma generate
```

Expected: two `Script executed successfully.` lines, then `Generated Prisma Client`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql server/prisma/schema.prisma server/tests/inquiryUnit.test.js
git commit -m "feat(schema): add optional Inquiry.unitId (unit of interest)"
```

---

### Task 2: Validation — accept optional `unitId`

**Files:**
- Modify: `server/src/validation/inquiry.js`
- Test: `server/tests/inquiryUnit.test.js` (extend)

**Interfaces:**
- Consumes: none.
- Produces: `inquiryCreateSchema` parses an optional `unitId` string; strips unknown otherwise.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/inquiryUnit.test.js`:

```js
import { inquiryCreateSchema } from "../src/validation/inquiry.js";

describe("inquiryCreateSchema unitId", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true };
  it("accepts an optional unitId", () => {
    const parsed = inquiryCreateSchema.parse({ ...base, unitId: "u123" });
    expect(parsed.unitId).toBe("u123");
  });
  it("is valid without a unitId", () => {
    const parsed = inquiryCreateSchema.parse(base);
    expect(parsed.unitId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: FAIL — `parsed.unitId` is `undefined` when passed "u123" (Zod strips the unknown key).

- [ ] **Step 3: Edit the schema**

In `server/src/validation/inquiry.js`, add `unitId` to the `inquiryCreateSchema` object (right after the `consent` line, before the closing `})` of `.object({...})`):

```js
    // Optional: the specific unit a lessee is inquiring about (public unit page).
    unitId: z.string().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/validation/inquiry.js server/tests/inquiryUnit.test.js
git commit -m "feat(validation): accept optional unitId on inquiry create"
```

---

### Task 3: Service — store `unitId` only if it resolves to a real unit

**Files:**
- Modify: `server/src/services/inquiryService.js:7-9` (`createInquiry`)
- Test: `server/tests/inquiryUnit.test.js` (extend)

**Interfaces:**
- Consumes: `Inquiry.unitId` (Task 1), `inquiryCreateSchema.unitId` (Task 2).
- Produces: `createInquiry(data)` persists `unitId` when the unit exists, else `null`; always creates the inquiry.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/inquiryUnit.test.js`:

```js
import { createInquiry } from "../src/services/inquiryService.js";

describe("createInquiry unit linking", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW" };
  it("stores a valid unitId", async () => {
    const { unit } = await ownerAndUnit();
    const inq = await createInquiry({ ...base, unitId: unit.id });
    expect(inq.unitId).toBe(unit.id);
  });
  it("nulls an unknown unitId but still creates the inquiry", async () => {
    const inq = await createInquiry({ ...base, unitId: "does-not-exist" });
    expect(inq.id).toBeTruthy();
    expect(inq.unitId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: FAIL — the unknown-unitId case throws a Prisma foreign-key error instead of nulling.

- [ ] **Step 3: Replace `createInquiry`**

In `server/src/services/inquiryService.js`, replace lines 7-9:

```js
export function createInquiry(data) {
  return prisma.inquiry.create({ data });
}
```

with:

```js
export async function createInquiry(data) {
  const { unitId, ...rest } = data;
  // Only keep the unit link if it resolves to a real unit; a stale/invalid id
  // must never block a public inquiry.
  let linkedUnitId = null;
  if (unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true } });
    if (unit) linkedUnitId = unit.id;
  }
  return prisma.inquiry.create({ data: { ...rest, unitId: linkedUnitId } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/inquiryService.js server/tests/inquiryUnit.test.js
git commit -m "feat(inquiry): persist unitId on create only when the unit exists"
```

---

### Task 4: Service — include the unit summary in staff reads

**Files:**
- Modify: `server/src/services/inquiryService.js:5` (`assigneeInclude`)
- Test: `server/tests/inquiryUnit.test.js` (extend)

**Interfaces:**
- Consumes: `Inquiry.unit` relation (Task 1).
- Produces: `listInquiries`, `assignInquiry`, `acceptInquiry`, `releaseInquiry` returns include `unit: { id, unitNumber, building }`.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/inquiryUnit.test.js`:

```js
import { listInquiries } from "../src/services/inquiryService.js";

describe("listInquiries includes the unit summary", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW" };
  it("returns a unit summary when the inquiry has one", async () => {
    const { unit } = await ownerAndUnit();
    await createInquiry({ ...base, unitId: unit.id });
    const rows = await listInquiries({ role: "ADMIN" });
    expect(rows[0].unit).toMatchObject({ id: unit.id, unitNumber: "15-08" });
  });
  it("returns null unit when there is none", async () => {
    await createInquiry({ ...base });
    const rows = await listInquiries({ role: "ADMIN" });
    expect(rows[0].unit).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: FAIL — `rows[0].unit` is `undefined` (not selected).

- [ ] **Step 3: Extend `assigneeInclude`**

In `server/src/services/inquiryService.js`, replace line 5:

```js
const assigneeInclude = { assignedTo: { select: { id: true, name: true, email: true } } };
```

with:

```js
const assigneeInclude = {
  assignedTo: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, building: true } },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/inquiryService.js server/tests/inquiryUnit.test.js
git commit -m "feat(inquiry): include unit summary in staff inquiry reads"
```

---

### Task 5: Accept — pre-link unit + lessor, warn if unavailable

**Files:**
- Modify: `server/src/services/leasingTransactionService.js:58-81` (`ensureForInquiry`)
- Test: `server/tests/inquiryUnit.test.js` (extend)

**Interfaces:**
- Consumes: `Inquiry.unitId` (Task 1), `acceptInquiry(user, id)` (existing).
- Produces: on accept, the transaction gets `unitId` + `unitOwnerId` from the inquiry's unit when it still exists; a `transactionEvent` records the pre-link; a second warning event is logged when the unit is not VACANT+APPROVED+published.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/inquiryUnit.test.js`:

```js
import { acceptInquiry } from "../src/services/inquiryService.js";

async function officer() {
  return prisma.user.create({ data: { name: "Officer", email: "officer@test.sim", passwordHash: "x", role: "LEASING_OFFICER" } });
}

describe("accept pre-links the inquired unit + lessor", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW" };

  it("sets transaction unitId and unitOwnerId from the inquiry's unit", async () => {
    const { owner, unit } = await ownerAndUnit();
    const inq = await createInquiry({ ...base, unitId: unit.id });
    const off = await officer();
    await acceptInquiry({ userId: off.id, role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    expect(txn.unitId).toBe(unit.id);
    expect(txn.unitOwnerId).toBe(owner.id);
  });

  it("leaves the transaction unlinked when the inquiry has no unit", async () => {
    const inq = await createInquiry({ ...base });
    const off = await officer();
    await acceptInquiry({ userId: off.id, role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    expect(txn.unitId).toBeNull();
    expect(txn.unitOwnerId).toBeNull();
  });

  it("logs a warning event when the inquired unit is not vacant", async () => {
    const { unit } = await ownerAndUnit();
    await prisma.unit.update({ where: { id: unit.id }, data: { status: "LEASED" } });
    const inq = await createInquiry({ ...base, unitId: unit.id });
    const off = await officer();
    await acceptInquiry({ userId: off.id, role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    const events = await prisma.transactionEvent.findMany({ where: { transactionId: txn.id } });
    expect(events.some((e) => e.message.includes("no longer available"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: FAIL — `txn.unitId`/`txn.unitOwnerId` are null even with a unit, and no warning event exists.

- [ ] **Step 3: Update `ensureForInquiry`**

In `server/src/services/leasingTransactionService.js`, replace the body of `ensureForInquiry` (lines 58-81) with:

```js
export async function ensureForInquiry(inquiry, actor) {
  const existing = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inquiry.id } });
  if (existing) return existing;

  // Pre-link the inquired unit + its lessor, if the inquiry carried one and it
  // still exists. A deleted unit has already nulled inquiry.unitId (FK SetNull).
  let unit = null;
  if (inquiry.unitId) {
    unit = await prisma.unit.findUnique({
      where: { id: inquiry.unitId },
      include: { listing: { select: { published: true } } },
    });
  }

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
      unitId: unit ? unit.id : null,
      unitOwnerId: unit ? unit.ownerId : null,
    },
  });
  await logEvent(txn.id, actor, `Inquiry accepted — transaction ${reference} created`, "INQUIRY");
  if (unit) {
    await logEvent(txn.id, actor, `Pre-linked inquired unit ${unit.unitNumber} and its lessor`, "INQUIRY");
    const available = unit.status === "VACANT" && unit.approvalStatus === "APPROVED" && unit.listing?.published === true;
    if (!available) {
      await logEvent(txn.id, actor, `Inquired unit ${unit.unitNumber} is no longer available (not vacant/published) — verify the link`, "INQUIRY");
    }
  }
  return txn;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server run test -- inquiryUnit`
Expected: PASS.

- [ ] **Step 5: Run the full server suite (guard against regressions in the accept flow)**

Run: `npm --workspace server run test`
Expected: all files pass (existing `inquiries`, `inquiryConversion`, `leasingTransactions` suites included).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/leasingTransactionService.js server/tests/inquiryUnit.test.js
git commit -m "feat(transaction): pre-link inquired unit + lessor on accept, warn if unavailable"
```

---

### Task 6: Public CTA carries the unit id

**Files:**
- Modify: `client/src/views/UnitDetailPublicView.vue` (add `inquiryLink` computed; line 142 CTA)
- Test: `client/tests/UnitDetailPublicView.test.js` (extend)

**Interfaces:**
- Produces: the "Inquire about this unit" link points to `/inquiry?as=LESSEE&unit=<unitId>`.

- [ ] **Step 1: Write the failing test**

Append a test to `client/tests/UnitDetailPublicView.test.js` inside its top-level `describe` (reuse the file's existing mount helper and `publicUnits.get` mock; the mocked unit must include `unitId: "u1"`):

```js
  it("points the inquire CTA at the unit-specific inquiry route", async () => {
    const w = await mountDetail(); // existing helper that mounts + awaits load
    const cta = w.findAll("a").find((a) => a.text().includes("Inquire about this unit"));
    expect(cta.attributes("href")).toContain("/inquiry?as=LESSEE&unit=u1");
  });
```

If the file has no `mountDetail` helper, mirror the existing test's mount pattern in this file and ensure the `publicUnits.get` mock returns an object containing `unitId: "u1"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- UnitDetailPublicView`
Expected: FAIL — the href is `/inquiry?as=LESSEE` (no `&unit=`).

- [ ] **Step 3: Add the computed and update the CTA**

In `client/src/views/UnitDetailPublicView.vue`, add after line 57 (`const typeChip = ...`):

```js
const inquiryLink = computed(() => `/inquiry?as=LESSEE&unit=${unit.value?.unitId ?? route.params.id}`);
```

Then change the CTA at line 142 from:

```html
          <RouterLink to="/inquiry?as=LESSEE" class="inquire-cta">Inquire about this unit</RouterLink>
```

to:

```html
          <RouterLink :to="inquiryLink" class="inquire-cta">Inquire about this unit</RouterLink>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client run test -- UnitDetailPublicView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/UnitDetailPublicView.vue client/tests/UnitDetailPublicView.test.js
git commit -m "feat(public): carry unitId from the unit detail inquire CTA"
```

---

### Task 7: Inquiry form — banner, category prefill, send `unitId`

**Files:**
- Modify: `client/src/views/InquiryView.vue` (script: read query, fetch unit, prefill; template: banner; submit payload)
- Test: `client/tests/InquiryView.test.js` (extend; add a `resource.js` mock)

**Interfaces:**
- Consumes: `publicUnits.get(unitId)` (existing, `client/src/lib/resource.js`), `createInquiry(payload)` (existing).
- Produces: when `?unit=<id>` is present, the form shows a context banner, defaults `category` to `RESIDENCES`, and includes `unitId` in the submit payload.

- [ ] **Step 1: Write the failing test**

In `client/tests/InquiryView.test.js`, add a `resource.js` mock next to the existing `inquiries.js` mock (top of file):

```js
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: { get: vi.fn(() => Promise.resolve({ unitId: "u1", headline: "Elegant 2BR", details: { unitNumber: "12A", propertyName: "Empress at Capitol Commons" } })) },
}));
```

Add a mount helper variant and test (the existing `mountView` pushes only `as`; add `unit` to the query):

```js
import { publicUnits } from "../src/lib/resource.js";

async function mountWithUnit() {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push({ path: "/", query: { as: "LESSEE", unit: "u1" } });
  await router.isReady();
  const w = mount(InquiryView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

it("shows the unit banner and sends unitId when arriving from a unit page", async () => {
  const w = await mountWithUnit();
  expect(w.text()).toContain("12A");
  // fill the required fields the form still needs
  await w.find("#fullName").setValue("Ana Reyes");
  await w.find("#email").setValue("ana@example.com");
  // choose the first valid inquiry type; category is prefilled to RESIDENCES
  const typeSelect = w.find("select#inquiryType");
  await typeSelect.setValue("Unit Availability");
  await w.find('input[type="checkbox"]').setValue(true);
  await w.find("form").trigger("submit.prevent");
  await flushPromises();
  expect(createInquiry).toHaveBeenCalledWith(expect.objectContaining({ unitId: "u1", category: "RESIDENCES" }));
});
```

Note: match the field selectors to the real markup in `InquiryView.vue` (ids for full name, email, inquiry type, and the consent checkbox). Adjust selectors if they differ; the assertion on `createInquiry` payload is the contract that matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- InquiryView`
Expected: FAIL — no banner text "12A", and `createInquiry` called without `unitId`.

- [ ] **Step 3: Update the script**

In `client/src/views/InquiryView.vue`:

Add the import (after the existing `createInquiry` import):

```js
import { publicUnits } from "../lib/resource.js";
```

After `const route = useRoute();`, add:

```js
const unitId = route.query.unit || null;
const unitContext = ref(null);
```

Replace the existing `onMounted(() => { if (!selectedType) router.replace("/"); });` with:

```js
onMounted(async () => {
  if (!selectedType) { router.replace("/"); return; }
  if (unitId) {
    form.category = "RESIDENCES"; // sensible default for the residential catalog; user can change
    try { unitContext.value = await publicUnits.get(unitId); } catch { unitContext.value = null; }
  }
});
```

In `submit()`, after the line `if (form.message.trim()) payload.message = form.message.trim();`, add:

```js
    if (unitId) payload.unitId = unitId;
```

- [ ] **Step 4: Add the banner to the template**

Inside the form, above the "Inquiring as ..." row (the block that renders `INQUIRER_LABEL[form.inquirerType]`), add:

```html
        <p v-if="unitContext" class="unit-context">
          Inquiring about
          <strong>Unit {{ unitContext.details?.unitNumber || "" }}</strong>
          <template v-if="unitContext.details?.propertyName || unitContext.headline">
            — {{ unitContext.details?.propertyName || unitContext.headline }}
          </template>
        </p>
```

Add a scoped style near the other form styles:

```css
.unit-context { margin: 0 0 1rem; padding: 0.55rem 0.8rem; background: var(--accent-050); color: var(--accent-text); border-radius: var(--radius-sm); font-size: 0.9rem; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace client run test -- InquiryView`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/InquiryView.vue client/tests/InquiryView.test.js
git commit -m "feat(inquiry-form): unit banner, RESIDENCES prefill, and send unitId"
```

---

### Task 8: Inquiries queue — unit-of-interest chip

**Files:**
- Modify: `client/src/views/InquiriesView.vue` (add a "Unit" column header + cell)
- Test: `client/tests/InquiriesView.test.js` (extend the mock + add a test)

**Interfaces:**
- Consumes: `listInquiries()` rows now carry `unit: { id, unitNumber, building } | null` (Task 4).
- Produces: each row shows a "Unit <n>" chip when a unit is linked, and a dash otherwise.

- [ ] **Step 1: Write the failing test**

In `client/tests/InquiriesView.test.js`, add `unit: { id: "u1", unitNumber: "12A", building: "Empress" }` to the first mocked row (`i1`) in the `listInquiries` mock, then add:

```js
it("shows a unit chip for an inquiry that references a unit", async () => {
  const w = mountAs("ADMIN");
  await flushPromises();
  expect(w.find(".unit-chip").text()).toContain("Unit 12A");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- InquiriesView`
Expected: FAIL — no `.unit-chip` element found.

- [ ] **Step 3: Add the column**

In `client/src/views/InquiriesView.vue`, in the `<thead>` row (currently the `<th>...Inquiry Type</th>` header at line ~94), add a `Unit` header after the "Inquiry Type" `<th>`:

```html
          <th>Unit</th>
```

In the `<tr v-for="r in rows" ...>` body, add a matching cell after the inquiry-type `<td>{{ r.inquiryType }}</td>` (line ~104):

```html
          <td><span v-if="r.unit" class="unit-chip">Unit {{ r.unit.unitNumber }}</span><span v-else class="muted">—</span></td>
```

Add a scoped style near the other tag styles:

```css
.unit-chip { display: inline-block; font-size: 0.72rem; font-weight: 700; color: var(--accent-text); background: var(--accent-050); border-radius: 999px; padding: 0.1rem 0.5rem; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client run test -- InquiriesView`
Expected: PASS.

- [ ] **Step 5: Run the full client suite**

Run: `npm --workspace client run test`
Expected: all files pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/InquiriesView.vue client/tests/InquiriesView.test.js
git commit -m "feat(inquiries): show unit-of-interest chip in the staff queue"
```

---

## Final verification

- [ ] Run both suites: `npm --workspace server run test` and `npm --workspace client run test` — all green.
- [ ] Manual smoke (optional, dev server on :5050): from a published unit's public detail page, click "Inquire about this unit" → the form shows the banner and category is RESIDENCES → submit → the inquiry appears in the staff queue with a Unit chip → accept it → the transaction opens already linked to that unit and its lessor.

## Deployment note

Each environment must run `server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql` and then `prisma generate` before the new server code is deployed. Dev + test are handled in Task 1; production runs the same SQL per its own process.
