# Lessor Requirements Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A lessor-scoped requirements checklist — a fixed set of required document types, each with an uploaded file and a status (Required → Submitted → reviewed), visible to the lessor and reviewable by O-Lease.

**Architecture:** A shared config lists the requirement types + statuses. A `LessorRequirement` table holds one row per (owner, type) with the file bytes, status, remarks, and review metadata. The service always returns the full checklist (synthesizing "Required" for missing rows). Lessors upload/view their own; staff review any and can upload on-behalf. Two Vue views (lessor + staff).

**Tech Stack:** Node/Express, Prisma (PostgreSQL), Zod, multer (memory), Vitest+Supertest; Vue 3, Vitest+@vue/test-utils.

## Global Constraints

- Requirement keys are exactly: `GOV_ID, OWNERSHIP, TAX_DEC, RPT_RECEIPT, AUTH_LETTER, ASSOC_CLEARANCE, BANK_DETAILS`. Statuses: `Required, Submitted, Under Review, Approved, Rejected, Expired, For Resubmission`. Default status `Required`.
- File uploads: PDF/JPEG/PNG/DOCX, ≤10 MB (same allow-list as `requirementRoutes.js`). Never return the `data` bytes in list/detail JSON — only via the download endpoint.
- A `UNIT_OWNER` acts only on their own `unitOwnerId` (else 404, not disclosed); `ADMIN`/`LEASING_OFFICER` act on any owner.
- Server tests run against `rbu_leasing_test` (forced+guarded by `server/tests/setup.env.js`). Run one file: `cd server && npx vitest run tests/<file>`; client: `cd client && npx vitest run tests/<file>`.

---

### Task 1: Foundation — shared config + Prisma model + migration

**Files:**
- Create: `shared/lessorRequirements.js`
- Modify: `server/prisma/schema.prisma` (new model + `UnitOwner` back-relation)
- Create: `server/prisma/migrations/20260828090000_lessor_requirements/migration.sql`
- Test: `server/tests/lessorRequirementsConfig.test.js`

**Interfaces:**
- Produces: `LESSOR_REQUIREMENT_TYPES` (7 × `{key,label}`), `REQUIREMENT_STATUSES`, `REQUIREMENT_KEYS`; Prisma model `LessorRequirement`.

- [ ] **Step 1: Write the config test**

Create `server/tests/lessorRequirementsConfig.test.js`:
```js
import { describe, it, expect } from "vitest";
import { LESSOR_REQUIREMENT_TYPES, REQUIREMENT_KEYS, REQUIREMENT_STATUSES } from "../../shared/lessorRequirements.js";

describe("Lessor requirements config", () => {
  it("lists the seven requirement types with keys and labels", () => {
    expect(REQUIREMENT_KEYS).toEqual([
      "GOV_ID", "OWNERSHIP", "TAX_DEC", "RPT_RECEIPT", "AUTH_LETTER", "ASSOC_CLEARANCE", "BANK_DETAILS",
    ]);
    expect(LESSOR_REQUIREMENT_TYPES.every((t) => t.key && t.label)).toBe(true);
  });
  it("defines the status vocabulary", () => {
    expect(REQUIREMENT_STATUSES).toContain("Required");
    expect(REQUIREMENT_STATUSES).toContain("Submitted");
    expect(REQUIREMENT_STATUSES).toContain("For Resubmission");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/lessorRequirementsConfig.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the config**

Create `shared/lessorRequirements.js`:
```js
// Canonical checklist of documents a lessor (unit owner) submits to O-Lease.
export const LESSOR_REQUIREMENT_TYPES = [
  { key: "GOV_ID",          label: "Valid Government ID" },
  { key: "OWNERSHIP",       label: "Proof of Ownership (Title / CCT)" },
  { key: "TAX_DEC",         label: "Tax Declaration" },
  { key: "RPT_RECEIPT",     label: "Latest Real Property Tax Receipt" },
  { key: "AUTH_LETTER",     label: "Authorization Letter / SPA" },
  { key: "ASSOC_CLEARANCE", label: "Association / Dues Clearance" },
  { key: "BANK_DETAILS",    label: "Bank Account Details" },
];

export const REQUIREMENT_STATUSES = [
  "Required", "Submitted", "Under Review", "Approved", "Rejected", "Expired", "For Resubmission",
];

export const REQUIREMENT_KEYS = LESSOR_REQUIREMENT_TYPES.map((r) => r.key);
export const labelFor = (key) => LESSOR_REQUIREMENT_TYPES.find((r) => r.key === key)?.label || key;
```

- [ ] **Step 4: Add the Prisma model + relation**

In `server/prisma/schema.prisma`, add the model (near `Requirement`):
```prisma
model LessorRequirement {
  id             String    @id @default(cuid())
  unitOwner      UnitOwner @relation(fields: [unitOwnerId], references: [id])
  unitOwnerId    String
  requirementKey String
  status         String    @default("Required")
  filename       String?
  mimeType       String?
  size           Int?
  data           Bytes?
  remarks        String?
  expiresAt      DateTime?
  submittedAt    DateTime?
  reviewedById   String?
  reviewedByName String?
  reviewedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@unique([unitOwnerId, requirementKey])
}
```
And add to `model UnitOwner` (in its relations list): `lessorRequirements LessorRequirement[]`.

- [ ] **Step 5: Write the migration**

Create `server/prisma/migrations/20260828090000_lessor_requirements/migration.sql`:
```sql
CREATE TABLE "LessorRequirement" (
  "id" TEXT NOT NULL,
  "unitOwnerId" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Required',
  "filename" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "data" BYTEA,
  "remarks" TEXT,
  "expiresAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessorRequirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessorRequirement_unitOwnerId_requirementKey_key" ON "LessorRequirement"("unitOwnerId", "requirementKey");
ALTER TABLE "LessorRequirement" ADD CONSTRAINT "LessorRequirement_unitOwnerId_fkey" FOREIGN KEY ("unitOwnerId") REFERENCES "UnitOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 6: Apply to test DB + generate + run the config test**

```
cd server && DATABASE_URL="postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing_test?schema=public" npx prisma migrate deploy && npx prisma generate
npx vitest run tests/lessorRequirementsConfig.test.js
```
Expected: migration applies, client regenerates, config test PASSES. (Stop the dev server first if `generate` hits an EPERM lock.)

- [ ] **Step 7: Commit**

```bash
git add shared/lessorRequirements.js server/prisma/schema.prisma server/prisma/migrations server/tests/lessorRequirementsConfig.test.js
git commit -m "feat(lessor-reqs): shared config + LessorRequirement model/migration"
```

---

### Task 2: Server — service, validation, routes, controller, mount + tests

**Files:**
- Create: `server/src/services/lessorRequirementService.js`, `server/src/validation/lessorRequirement.js`, `server/src/controllers/lessorRequirementController.js`, `server/src/routes/lessorRequirementRoutes.js`
- Modify: `server/src/app.js` (import + mount)
- Test: `server/tests/lessorRequirements.test.js`

**Interfaces:**
- Consumes: config + model from Task 1.
- Produces: `GET /api/lessor-requirements/mine`, `GET /:unitOwnerId`, `POST /mine/:key`, `POST /:unitOwnerId/:key`, `PATCH /:id/review`, `GET /:id/download`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/lessorRequirements.test.js`:
```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const pdf = () => Buffer.from("%PDF-1.4 test");

describe("Lessor requirements checklist", () => {
  it("returns all seven items, missing ones as Required, no bytes", async () => {
    const o = await factory.owner();
    const res = await request(app).get("/api/lessor-requirements/mine").set(auth(tokens.owner(o.id)));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body.every((r) => r.status)).toBe(true);
    expect(res.body.find((r) => r.requirementKey === "GOV_ID").status).toBe("Required");
    expect(res.body.every((r) => r.data === undefined)).toBe(true);
  });

  it("owner uploads a document -> Submitted, own-only", async () => {
    const o = await factory.owner();
    const up = await request(app).post("/api/lessor-requirements/mine/GOV_ID")
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "id.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect(up.body.status).toBe("Submitted");
    expect(up.body.data).toBeUndefined();

    const other = await factory.owner({ name: "Two" });
    const list = await request(app).get("/api/lessor-requirements/mine").set(auth(tokens.owner(o.id)));
    expect(list.body.find((r) => r.requirementKey === "GOV_ID").status).toBe("Submitted");
    // owner cannot upload for another owner via the staff path
    const cross = await request(app).post(`/api/lessor-requirements/${other.id}/GOV_ID`)
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "x.pdf", contentType: "application/pdf" });
    expect(cross.status).toBe(403);
  });

  it("rejects an unknown requirement key", async () => {
    const o = await factory.owner();
    const res = await request(app).post("/api/lessor-requirements/mine/NOPE")
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
  });

  it("staff uploads on behalf and reviews with a status + remark", async () => {
    const o = await factory.owner();
    const up = await request(app).post(`/api/lessor-requirements/${o.id}/OWNERSHIP`)
      .set(auth(tokens.officer())).attach("file", pdf(), { filename: "title.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    const rev = await request(app).patch(`/api/lessor-requirements/${up.body.id}/review`)
      .set(auth(tokens.officer())).send({ status: "Approved", remarks: "Verified" });
    expect(rev.body.status).toBe("Approved");
    expect(rev.body.remarks).toBe("Verified");

    const bad = await request(app).patch(`/api/lessor-requirements/${up.body.id}/review`)
      .set(auth(tokens.officer())).send({ status: "Bogus" });
    expect(bad.status).toBe(400);
  });

  it("scopes downloads to the owner or staff", async () => {
    const o = await factory.owner(); const other = await factory.owner({ name: "Two" });
    const up = await request(app).post("/api/lessor-requirements/mine/TAX_DEC")
      .set(auth(tokens.owner(o.id))).attach("file", pdf(), { filename: "t.pdf", contentType: "application/pdf" });
    const mine = await request(app).get(`/api/lessor-requirements/${up.body.id}/download`).set(auth(tokens.owner(o.id)));
    expect(mine.status).toBe(200);
    const theirs = await request(app).get(`/api/lessor-requirements/${up.body.id}/download`).set(auth(tokens.owner(other.id)));
    expect(theirs.status).toBe(404);
    const staff = await request(app).get(`/api/lessor-requirements/${up.body.id}/download`).set(auth(tokens.officer()));
    expect(staff.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/lessorRequirements.test.js`
Expected: FAIL — routes don't exist (404s).

- [ ] **Step 3: Validation**

Create `server/src/validation/lessorRequirement.js`:
```js
import { z } from "zod";
import { REQUIREMENT_STATUSES } from "../../../shared/lessorRequirements.js";

export const reviewSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES),
  remarks: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});
```

- [ ] **Step 4: Service**

Create `server/src/services/lessorRequirementService.js`:
```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";
import { LESSOR_REQUIREMENT_TYPES, REQUIREMENT_KEYS, labelFor } from "../../../shared/lessorRequirements.js";

const META = {
  id: true, unitOwnerId: true, requirementKey: true, status: true, filename: true, mimeType: true,
  size: true, remarks: true, expiresAt: true, submittedAt: true, reviewedByName: true, reviewedAt: true,
  createdAt: true, updatedAt: true,
};

// Full checklist for an owner: config order, missing items synthesized as Required.
export async function listForOwner(unitOwnerId) {
  const rows = await prisma.lessorRequirement.findMany({ where: { unitOwnerId }, select: META });
  const byKey = new Map(rows.map((r) => [r.requirementKey, r]));
  return LESSOR_REQUIREMENT_TYPES.map((t) =>
    byKey.get(t.key) || { unitOwnerId, requirementKey: t.key, label: t.label, status: "Required" }
  ).map((r) => ({ ...r, label: labelFor(r.requirementKey) }));
}

export async function uploadRequirement(unitOwnerId, key, file) {
  if (!REQUIREMENT_KEYS.includes(key)) throw new InvalidReferenceError("Unknown requirement type");
  const row = await prisma.lessorRequirement.upsert({
    where: { unitOwnerId_requirementKey: { unitOwnerId, requirementKey: key } },
    update: {
      filename: file.originalname, mimeType: file.mimetype, size: file.size, data: file.buffer,
      status: "Submitted", submittedAt: new Date(), remarks: null,
      reviewedById: null, reviewedByName: null, reviewedAt: null,
    },
    create: {
      unitOwnerId, requirementKey: key, status: "Submitted", submittedAt: new Date(),
      filename: file.originalname, mimeType: file.mimetype, size: file.size, data: file.buffer,
    },
    select: META,
  });
  return row;
}

export async function reviewRequirement(actor, id, { status, remarks, expiresAt }) {
  const existing = await prisma.lessorRequirement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Requirement not found");
  let reviewerName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    reviewerName = u?.name || u?.email || null;
  }
  return prisma.lessorRequirement.update({
    where: { id },
    data: {
      status, remarks: remarks ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null,
      reviewedById: actor?.userId || null, reviewedByName: reviewerName, reviewedAt: new Date(),
    },
    select: META,
  });
}

export async function getForDownload(id) {
  const row = await prisma.lessorRequirement.findUnique({ where: { id } });
  if (!row || !row.data) throw new NotFoundError("Document not found");
  return row;
}
```

- [ ] **Step 5: Controller**

Create `server/src/controllers/lessorRequirementController.js`:
```js
import * as service from "../services/lessorRequirementService.js";
import { reviewSchema } from "../validation/lessorRequirement.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

export async function listMine(req, res, next) {
  try { res.json(await service.listForOwner(req.user.unitOwnerId)); } catch (e) { next(e); }
}
export async function listForOwner(req, res, next) {
  try { res.json(await service.listForOwner(req.params.unitOwnerId)); } catch (e) { next(e); }
}
export async function uploadMine(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    res.status(201).json(await service.uploadRequirement(req.user.unitOwnerId, req.params.key, req.file));
  } catch (e) { next(e); }
}
export async function uploadForOwner(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    res.status(201).json(await service.uploadRequirement(req.params.unitOwnerId, req.params.key, req.file));
  } catch (e) { next(e); }
}
export async function review(req, res, next) {
  try {
    const data = reviewSchema.parse(req.body);
    res.json(await service.reviewRequirement(req.user, req.params.id, data));
  } catch (e) { next(e); }
}
export async function download(req, res, next) {
  try {
    const row = await service.getForDownload(req.params.id);
    if (req.user.role === "UNIT_OWNER" && row.unitOwnerId !== req.user.unitOwnerId) throw new NotFoundError("Document not found");
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${row.filename}"`);
    res.send(Buffer.from(row.data));
  } catch (e) { next(e); }
}
```

- [ ] **Step 6: Routes (order matters — literal `mine` before `:unitOwnerId`)**

Create `server/src/routes/lessorRequirementRoutes.js`:
```js
import { Router } from "express";
import multer from "multer";
import * as ctrl from "../controllers/lessorRequirementController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const ALLOWED = new Set([
  "application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

const router = Router();
router.use(verifyJwt);

// Owner's own checklist + upload (literal `mine` before the :unitOwnerId param routes).
router.get("/mine", requireRole("UNIT_OWNER"), ctrl.listMine);
router.post("/mine/:key", requireRole("UNIT_OWNER"), upload.single("file"), ctrl.uploadMine);

// Download by row id (scoped in the controller). Before the bare :unitOwnerId GET.
router.get("/:id/download", requireRole("UNIT_OWNER", "ADMIN", "LEASING_OFFICER"), ctrl.download);

// Staff review + on-behalf upload + a lessor's checklist.
router.patch("/:id/review", requireRole("ADMIN", "LEASING_OFFICER"), ctrl.review);
router.post("/:unitOwnerId/:key", requireRole("ADMIN", "LEASING_OFFICER"), upload.single("file"), ctrl.uploadForOwner);
router.get("/:unitOwnerId", requireRole("ADMIN", "LEASING_OFFICER"), ctrl.listForOwner);

export default router;
```

- [ ] **Step 7: Mount in app.js**

In `server/src/app.js`, add the import with the other route imports and mount it after the requirements route:
```js
import lessorRequirementRoutes from "./routes/lessorRequirementRoutes.js";
```
```js
  app.use("/api/lessor-requirements", lessorRequirementRoutes);
```

- [ ] **Step 8: Run the tests + full suite**

Run: `cd server && npx vitest run tests/lessorRequirements.test.js` → PASS.
Then `cd server && npx vitest run` → all pass.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/lessorRequirementService.js server/src/validation/lessorRequirement.js server/src/controllers/lessorRequirementController.js server/src/routes/lessorRequirementRoutes.js server/src/app.js server/tests/lessorRequirements.test.js
git commit -m "feat(lessor-reqs): checklist API (list/upload/review/download)"
```

---

### Task 3: Client — resource wrapper + lessor "My Requirements" view

**Files:**
- Modify: `client/src/lib/resource.js` (add `lessorRequirements`)
- Create: `client/src/views/MyLessorRequirementsView.vue`
- Modify: `client/src/router/index.js`, `client/src/components/AppLayout.vue`
- Test: `client/tests/MyLessorRequirementsView.test.js`

**Interfaces:**
- Consumes: the Task 2 endpoints. Produces: `lessorRequirements.mine()`, `.uploadMine(key,file)`, `.forOwner(id)`, `.uploadFor(ownerId,key,file)`, `.review(id,body)`, `.download(id)`.

- [ ] **Step 1: Add the resource wrapper**

In `client/src/lib/resource.js`, add near the other resources:
```js
export const lessorRequirements = {
  mine: () => api.get("/lessor-requirements/mine").then((r) => r.data),
  forOwner: (id) => api.get(`/lessor-requirements/${id}`).then((r) => r.data),
  uploadMine: (key, file) => {
    const form = new FormData(); form.append("file", file);
    return api.post(`/lessor-requirements/mine/${key}`, form).then((r) => r.data);
  },
  uploadFor: (ownerId, key, file) => {
    const form = new FormData(); form.append("file", file);
    return api.post(`/lessor-requirements/${ownerId}/${key}`, form).then((r) => r.data);
  },
  review: (id, body) => api.patch(`/lessor-requirements/${id}/review`, body).then((r) => r.data),
  download: async (id) => {
    const res = await api.get(`/lessor-requirements/${id}/download`, { responseType: "blob" });
    return res.data;
  },
};
```

- [ ] **Step 2: Write the lessor view test**

Create `client/tests/MyLessorRequirementsView.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const checklist = [
  { requirementKey: "GOV_ID", label: "Valid Government ID", status: "Required" },
  { requirementKey: "OWNERSHIP", label: "Proof of Ownership (Title / CCT)", status: "Rejected", remarks: "Blurry scan", id: "r2", filename: "t.pdf" },
];
vi.mock("../src/lib/resource.js", () => ({
  lessorRequirements: {
    mine: vi.fn(() => Promise.resolve(checklist)),
    uploadMine: vi.fn(() => Promise.resolve({})),
    download: vi.fn(() => Promise.resolve(new Blob())),
  },
}));
import MyLessorRequirementsView from "../src/views/MyLessorRequirementsView.vue";
import { lessorRequirements } from "../src/lib/resource.js";

describe("MyLessorRequirementsView", () => {
  beforeEach(() => { lessorRequirements.mine.mockClear(); lessorRequirements.uploadMine.mockClear(); });
  it("renders the checklist with statuses and the rejection remark", async () => {
    const w = mount(MyLessorRequirementsView);
    await flushPromises();
    expect(w.text()).toContain("Valid Government ID");
    expect(w.text()).toContain("Required");
    expect(w.text()).toContain("Blurry scan");
  });
  it("uploads a file for a requirement", async () => {
    const w = mount(MyLessorRequirementsView);
    await flushPromises();
    const input = w.find('input[type="file"]');
    const file = new File(["x"], "id.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(lessorRequirements.uploadMine).toHaveBeenCalled();
    expect(lessorRequirements.uploadMine.mock.calls[0][0]).toBe("GOV_ID");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd client && npx vitest run tests/MyLessorRequirementsView.test.js`
Expected: FAIL — view doesn't exist.

- [ ] **Step 4: Create the lessor view**

Create `client/src/views/MyLessorRequirementsView.vue`:
```html
<script setup>
import { ref, onMounted } from "vue";
import { lessorRequirements } from "../lib/resource.js";

const rows = ref([]);
const busyKey = ref("");
const error = ref("");
const ACTIONABLE = ["Required", "Rejected", "For Resubmission", "Expired"];

async function load() { rows.value = await lessorRequirements.mine(); }
onMounted(load);

async function onFile(e, key) {
  const file = e.target.files?.[0];
  if (!file) return;
  busyKey.value = key; error.value = "";
  try { await lessorRequirements.uploadMine(key, file); await load(); }
  catch (err) { error.value = err.response?.data?.error || "Upload failed"; }
  finally { busyKey.value = ""; e.target.value = ""; }
}
async function download(row) {
  const blob = await lessorRequirements.download(row.id);
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = row.filename || "document"; a.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <section>
    <header><h1>My Requirements</h1><p class="muted">Upload the documents O-Lease needs. Track each one's status here.</p></header>
    <p v-if="error" class="error">{{ error }}</p>
    <ul class="list">
      <li v-for="r in rows" :key="r.requirementKey" class="item">
        <div class="item__main">
          <span class="item__label">{{ r.label }}</span>
          <span class="badge" :class="r.status.toLowerCase().replace(/ /g,'-')">{{ r.status }}</span>
        </div>
        <div v-if="r.remarks" class="remark">{{ r.remarks }}</div>
        <div class="item__actions">
          <button v-if="r.id && r.filename" type="button" class="link" @click="download(r)">Download</button>
          <label v-if="ACTIONABLE.includes(r.status)" class="upload">
            <span>{{ r.id && r.filename ? "Replace" : "Upload" }}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" :disabled="busyKey === r.requirementKey" @change="onFile($event, r.requirementKey)" />
          </label>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.item { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.75rem 0.9rem; }
.item__main { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.item__label { font-weight: 600; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.badge.rejected, .badge.expired, .badge.for-resubmission { background: var(--danger-050); color: var(--danger); }
.badge.approved { background: var(--good-050); color: var(--good); }
.badge.required { background: var(--paper); color: var(--muted); }
.remark { font-size: 0.82rem; color: var(--danger); margin-top: 0.3rem; }
.item__actions { display: flex; align-items: center; gap: 0.9rem; margin-top: 0.5rem; }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; }
.upload { font-size: 0.85rem; color: var(--accent-text); cursor: pointer; }
.upload input { display: block; font-size: 0.8rem; margin-top: 0.2rem; }
.error { color: var(--danger); }
</style>
```

- [ ] **Step 5: Router + nav**

In `client/src/router/index.js`, import and add a child route under `/app` (Owner-only), near the owner routes:
```js
import MyLessorRequirementsView from "../views/MyLessorRequirementsView.vue";
```
```js
      { path: "lessor-requirements", component: MyLessorRequirementsView, meta: { roles: ["UNIT_OWNER"] } },
```
In `client/src/components/AppLayout.vue`, add to `OWNER_GROUPS` items (after "Acceptance Form"):
```js
  { to: "/app/lessor-requirements", label: "Requirements", icon: "folder" },
```

- [ ] **Step 6: Run the test + client suite**

Run: `cd client && npx vitest run tests/MyLessorRequirementsView.test.js` → PASS. Then `cd client && npx vitest run` → all pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/resource.js client/src/views/MyLessorRequirementsView.vue client/src/router/index.js client/src/components/AppLayout.vue client/tests/MyLessorRequirementsView.test.js
git commit -m "feat(lessor-reqs): lessor My Requirements checklist view"
```

---

### Task 4: Client — staff "Lessor Requirements" review view

**Files:**
- Create: `client/src/views/LessorRequirementsView.vue`
- Modify: `client/src/router/index.js`, `client/src/components/AppLayout.vue`
- Test: `client/tests/LessorRequirementsView.test.js`

**Interfaces:**
- Consumes: `owners.list`, `lessorRequirements.forOwner/review/uploadFor/download`.

- [ ] **Step 1: Write the staff view test**

Create `client/tests/LessorRequirementsView.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const owners = [{ id: "o1", name: "Capitol Heights" }];
const checklist = [{ requirementKey: "GOV_ID", label: "Valid Government ID", status: "Submitted", id: "r1", filename: "id.pdf" }];
vi.mock("../src/lib/resource.js", () => ({
  owners: { list: vi.fn(() => Promise.resolve(owners)) },
  lessorRequirements: {
    forOwner: vi.fn(() => Promise.resolve(checklist)),
    review: vi.fn(() => Promise.resolve({})),
    uploadFor: vi.fn(() => Promise.resolve({})),
    download: vi.fn(() => Promise.resolve(new Blob())),
  },
}));
import LessorRequirementsView from "../src/views/LessorRequirementsView.vue";
import { owners, lessorRequirements } from "../src/lib/resource.js";

describe("LessorRequirementsView (staff)", () => {
  beforeEach(() => { owners.list.mockClear(); lessorRequirements.forOwner.mockClear(); lessorRequirements.review.mockClear(); });
  it("loads a lessor's checklist and reviews an item", async () => {
    const w = mount(LessorRequirementsView);
    await flushPromises();
    await w.find("select.owner-picker").setValue("o1");
    await flushPromises();
    expect(lessorRequirements.forOwner).toHaveBeenCalledWith("o1");
    expect(w.text()).toContain("Valid Government ID");
    // choose Approved and confirm
    await w.find("select.status-select").setValue("Approved");
    await w.find("button.review-btn").trigger("click");
    await flushPromises();
    expect(lessorRequirements.review).toHaveBeenCalled();
    expect(lessorRequirements.review.mock.calls[0][1].status).toBe("Approved");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npx vitest run tests/LessorRequirementsView.test.js`
Expected: FAIL — view doesn't exist.

- [ ] **Step 3: Create the staff view**

Create `client/src/views/LessorRequirementsView.vue`:
```html
<script setup>
import { ref, onMounted, reactive } from "vue";
import { owners, lessorRequirements } from "../lib/resource.js";
import { REQUIREMENT_STATUSES } from "../../../shared/lessorRequirements.js";

const ownerList = ref([]);
const ownerId = ref("");
const rows = ref([]);
const draft = reactive({}); // key -> chosen status
const remark = reactive({}); // key -> remark text
const error = ref("");

onMounted(async () => { ownerList.value = await owners.list(); });

async function loadOwner() {
  if (!ownerId.value) { rows.value = []; return; }
  rows.value = await lessorRequirements.forOwner(ownerId.value);
  rows.value.forEach((r) => { draft[r.requirementKey] = r.status; remark[r.requirementKey] = r.remarks || ""; });
}
async function review(r) {
  error.value = "";
  try {
    await lessorRequirements.review(r.id, { status: draft[r.requirementKey], remarks: remark[r.requirementKey] || null });
    await loadOwner();
  } catch (e) { error.value = e.response?.data?.error || "Review failed"; }
}
async function onFile(e, key) {
  const file = e.target.files?.[0]; if (!file) return;
  try { await lessorRequirements.uploadFor(ownerId.value, key, file); await loadOwner(); }
  catch (err) { error.value = err.response?.data?.error || "Upload failed"; }
  finally { e.target.value = ""; }
}
async function download(row) {
  const blob = await lessorRequirements.download(row.id);
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = row.filename || "document"; a.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <section>
    <header><h1>Lessor Requirements</h1><p class="muted">Review each lessor's document checklist.</p></header>
    <div class="field">
      <label>Lessor</label>
      <select class="owner-picker" v-model="ownerId" @change="loadOwner">
        <option value="">— select a lessor —</option>
        <option v-for="o in ownerList" :key="o.id" :value="o.id">{{ o.name }}</option>
      </select>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <table v-if="rows.length" class="grid">
      <thead><tr><th>Requirement</th><th>Status</th><th>Document</th><th>Review</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.requirementKey">
          <td>{{ r.label }}</td>
          <td><span class="badge">{{ r.status }}</span></td>
          <td>
            <button v-if="r.id && r.filename" type="button" class="link" @click="download(r)">Download</button>
            <label class="upload"><span>Upload</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" @change="onFile($event, r.requirementKey)" /></label>
          </td>
          <td class="review">
            <template v-if="r.id">
              <select class="status-select" v-model="draft[r.requirementKey]">
                <option v-for="s in REQUIREMENT_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
              <input class="remark-input" type="text" v-model="remark[r.requirementKey]" placeholder="Remark (optional)" />
              <button type="button" class="review-btn" @click="review(r)">Save</button>
            </template>
            <span v-else class="muted small">no document yet</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); } .small { font-size: 0.8rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; max-width: 360px; margin-bottom: 1rem; }
.badge { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--accent-050); color: var(--accent-text); }
.link { background: none; border: none; color: var(--accent-text); cursor: pointer; padding: 0; margin-right: 0.6rem; }
.upload { font-size: 0.8rem; color: var(--accent-text); cursor: pointer; }
.upload input { display: inline-block; font-size: 0.75rem; }
.review { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.remark-input { font: inherit; font-size: 0.82rem; padding: 0.3rem 0.4rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
.error { color: var(--danger); }
</style>
```

- [ ] **Step 4: Router + nav (staff)**

In `client/src/router/index.js`:
```js
import LessorRequirementsView from "../views/LessorRequirementsView.vue";
```
```js
      { path: "lessor-requirements-review", component: LessorRequirementsView, meta: { roles: WRITE } },
```
(Use a distinct path from the owner route to avoid collision.) In `client/src/components/AppLayout.vue`, add to `STAFF_GROUPS` "Workspace" items (near the Sheets entries), write-staff:
```js
    { to: "/app/lessor-requirements-review", label: "Lessor Requirements", icon: "folder", write: true },
```

- [ ] **Step 5: Run the test + client suite**

Run: `cd client && npx vitest run tests/LessorRequirementsView.test.js` → PASS. Then `cd client && npx vitest run` → all pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/LessorRequirementsView.vue client/src/router/index.js client/src/components/AppLayout.vue client/tests/LessorRequirementsView.test.js
git commit -m "feat(lessor-reqs): staff Lessor Requirements review view"
```

---

### Task 5: Full verification

- [ ] **Step 1:** `cd server && npx vitest run` → all pass.
- [ ] **Step 2:** `cd client && npx vitest run` → all pass.
- [ ] **Step 3:** Apply the migration to the DEV DB and regenerate (stop the dev server first if `generate` locks):
  `cd server && npx prisma migrate deploy && npx prisma generate`
- [ ] **Step 4:** `npm --workspace client run build` → clean.
- [ ] **Step 5:** Manual smoke (server on :5050): as a lessor, open **My Requirements** → upload a PDF for "Valid Government ID" → status shows **Submitted**; as staff, open **Lessor Requirements**, pick that lessor, set the item to **Approved** with a remark → the lessor sees **Approved**. Delete any test data created.

---

## Notes for the implementer

- **Route ordering** in `lessorRequirementRoutes.js` is deliberate: the literal `/mine` and `/mine/:key` routes and `/:id/download`, `/:id/review` must be registered before the bare `/:unitOwnerId` GET and `/:unitOwnerId/:key` POST, or Express will capture `mine`/download ids as an owner id.
- Never select the `data` column in list/detail responses — only stream it from the download endpoint (the `META` select omits it).
- Follow the existing multer allow-list + 10 MB limit exactly (copied from `requirementRoutes.js`).
