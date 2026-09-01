# Unit Listing & Photo Management Implementation Plan (Sub-project I)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff module + API to upload/manage a unit's photos, edit its display details, configure its card, and publish/unpublish it — plus the read API the public page (sub-project J) will consume.

**Architecture:** Two new tables (`UnitPhoto` bytes-in-DB, `UnitListing` 1:1 with Unit holding details/config/publish). A `unitListingService` does the CRUD + publish + public reads. Staff routes `/api/unit-listings/*` (authed) and public routes `/api/public/units/*` (no auth, published-only). A staff `UnitListingView` manages it.

**Tech Stack:** Node/Express, Prisma/PostgreSQL, Zod, multer (memory, image allow-list), Vitest + Supertest (server), Vitest + @vue/test-utils (client), Vue 3, axios.

## Global Constraints

- Additive only; nullable/defaulted columns; migration applied via idempotent SQL (`CREATE TABLE IF NOT EXISTS`) to dev + test, NOT `prisma migrate dev` (history is diverged). Never truncate/drop. Subagents must never run prisma migrate/db push or touch the dev DB.
- Tests run against `rbu_leasing_test` only (guarded by `server/tests/setup.env.js`).
- Displayable detail fields come from `shared/unitListingFields.js` `UNIT_LISTING_FIELDS`; every `details`/`visibleFields` key MUST be a catalog key (`isListingFieldKey`).
- Photo uploads: multer memory storage, `limits.fileSize = 10*1024*1024`, allow-list `image/jpeg`, `image/png`, `image/webp`.
- Public reads expose ONLY units that are `published && status === "VACANT" && approvalStatus === "APPROVED"`, and never leak photo bytes for unpublished units. Card DTOs carry only `visibleFields` and never raw `data` bytes.
- Publish requires the unit `approvalStatus === "APPROVED"` and ≥1 photo (else 409).

---

### Task 1: Shared unit-listing field catalog

**Files:**
- Create: `shared/unitListingFields.js`
- Test: `server/tests/unitListingFields.test.js` (new)

**Interfaces:**
- Produces: `UNIT_LISTING_FIELDS`, `UNIT_LISTING_FIELD_KEYS`, `DEFAULT_VISIBLE_FIELDS`, `isListingFieldKey(key)`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/unitListingFields.test.js` (mirror the import style of `server/tests/leasingStages.test.js`, which imports from `../../shared/...`):
```js
import { describe, it, expect } from "vitest";
import { UNIT_LISTING_FIELDS, UNIT_LISTING_FIELD_KEYS, DEFAULT_VISIBLE_FIELDS, isListingFieldKey } from "../../shared/unitListingFields.js";

describe("unit listing fields", () => {
  it("has a catalog with keys and labels", () => {
    expect(UNIT_LISTING_FIELDS.length).toBeGreaterThan(5);
    for (const f of UNIT_LISTING_FIELDS) { expect(f.key).toBeTruthy(); expect(f.label).toBeTruthy(); expect(f.type).toBeTruthy(); }
    expect(UNIT_LISTING_FIELD_KEYS).toContain("bedrooms");
    expect(UNIT_LISTING_FIELD_KEYS).toContain("rentalRate");
  });
  it("default visible fields are all catalog keys", () => {
    for (const k of DEFAULT_VISIBLE_FIELDS) expect(UNIT_LISTING_FIELD_KEYS).toContain(k);
  });
  it("isListingFieldKey guards unknown keys", () => {
    expect(isListingFieldKey("bedrooms")).toBe(true);
    expect(isListingFieldKey("sneaky")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run from `server/`: `npx vitest run tests/unitListingFields.test.js`  → FAIL (module missing).

- [ ] **Step 3: Create the catalog**

Create `shared/unitListingFields.js`:
```js
// Canonical catalog of the details a unit card can display. Drives the staff
// editor, the public card renderer (sub-project J), and server validation.
// `fromUnit` names the core Unit field a detail is pre-filled from, if any.
export const UNIT_LISTING_FIELDS = [
  { key: "propertyName",       label: "Property / Building Name", type: "text",     fromUnit: "building" },
  { key: "unitNumber",         label: "Unit Number",              type: "text",     fromUnit: "unitNumber" },
  { key: "location",           label: "Location",                 type: "text" },
  { key: "unitType",           label: "Unit Type",                type: "text",     fromUnit: "type" },
  { key: "floorArea",          label: "Floor Area (sqm)",         type: "number",   fromUnit: "sizeSqm" },
  { key: "bedrooms",           label: "Bedrooms",                 type: "number" },
  { key: "bathrooms",          label: "Bathrooms",                type: "number" },
  { key: "rentalRate",         label: "Rental Rate",              type: "number",   fromUnit: "baseRent" },
  { key: "amenities",          label: "Amenities & Features",     type: "list" },
  { key: "description",        label: "Unit Description",         type: "textarea" },
  { key: "availabilityStatus", label: "Availability Status",      type: "text" },
];
export const UNIT_LISTING_FIELD_KEYS = UNIT_LISTING_FIELDS.map((f) => f.key);
export const DEFAULT_VISIBLE_FIELDS = ["propertyName", "unitNumber", "location", "unitType", "floorArea", "bedrooms", "bathrooms", "rentalRate"];
export function isListingFieldKey(key) { return UNIT_LISTING_FIELD_KEYS.includes(key); }
```

- [ ] **Step 4: Run — verify pass**  `npx vitest run tests/unitListingFields.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add shared/unitListingFields.js server/tests/unitListingFields.test.js
git commit -m "feat(unit-listing): shared display-field catalog"
```

---

### Task 2: UnitPhoto + UnitListing models + additive tables

**Files:**
- Modify: `server/prisma/schema.prisma` (two models + back-relations on `Unit`)
- Create: `server/prisma/manual-migrations/2026-09-01-unit-listings.sql`

**Interfaces:**
- Produces: `prisma.unitPhoto`, `prisma.unitListing`; `Unit.photos`, `Unit.listing`.

> Controller-only task (runs a DB migration + stops the dev server). If dispatched to a subagent, report BLOCKED.

- [ ] **Step 1: Add the models + back-relations**

In `server/prisma/schema.prisma`, add to `model Unit` (beside `leases`/`leasingTransactions`):
```prisma
  photos     UnitPhoto[]
  listing    UnitListing?
```
Add the models (near the other transaction-adjacent models):
```prisma
model UnitPhoto {
  id            String   @id @default(cuid())
  unit          Unit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  unitId        String
  data          Bytes
  mimeType      String
  size          Int
  caption       String?
  sortOrder     Int      @default(0)
  createdById   String?
  createdByName String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([unitId])
}

model UnitListing {
  id            String   @id @default(cuid())
  unit          Unit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  unitId        String   @unique
  published     Boolean  @default(false)
  publishedAt   DateTime?
  headline      String?
  details       Json     @default("{}")
  visibleFields Json     @default("[]")
  coverPhotoId  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

- [ ] **Step 2: Write the SQL migration**

Create `server/prisma/manual-migrations/2026-09-01-unit-listings.sql`:
```sql
CREATE TABLE IF NOT EXISTS "UnitPhoto" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UnitPhoto_unitId_idx" ON "UnitPhoto"("unitId");
CREATE TABLE IF NOT EXISTS "UnitListing" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "headline" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "visibleFields" JSONB NOT NULL DEFAULT '[]',
  "coverPhotoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UnitListing_unitId_key" ON "UnitListing"("unitId");
DO $$ BEGIN
  ALTER TABLE "UnitPhoto" ADD CONSTRAINT "UnitPhoto_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UnitListing" ADD CONSTRAINT "UnitListing_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 3: Apply to dev + test, regenerate (stop the server first)**
```bash
npx prisma db execute --url "postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing?schema=public" --file prisma/manual-migrations/2026-09-01-unit-listings.sql
npx prisma db execute --url "postgresql://postgres:bpmsystem@localhost:5432/rbu_leasing_test?schema=public" --file prisma/manual-migrations/2026-09-01-unit-listings.sql
npx prisma generate
```

- [ ] **Step 4: Verify** `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log(!!p.unitPhoto,!!p.unitListing)"` → `true true`.

- [ ] **Step 5: Commit**
```bash
git add server/prisma/schema.prisma server/prisma/manual-migrations/2026-09-01-unit-listings.sql
git commit -m "feat(unit-listing): UnitPhoto + UnitListing tables (additive SQL)"
```

---

### Task 3: Service + routes — getForUnit, updateListing

**Files:**
- Create: `server/src/services/unitListingService.js`, `server/src/validation/unitListing.js`, `server/src/controllers/unitListingController.js`, `server/src/routes/unitListingRoutes.js`
- Modify: `server/src/app.js` (mount `/api/unit-listings`)
- Test: `server/tests/unitListings.test.js` (new)

**Interfaces:**
- Consumes: `prisma`; `UNIT_LISTING_FIELDS`, `DEFAULT_VISIBLE_FIELDS`, `isListingFieldKey` from shared; error classes from `../lib/errors.js`.
- Produces: `getForUnit(unitId)`, `updateListing(user, unitId, body)`; routes `GET /api/unit-listings/:unitId`, `PATCH /api/unit-listings/:unitId`. Photo/publish/public functions land in Tasks 4-5 (same files).

- [ ] **Step 1: Write the failing tests**

Create `server/tests/unitListings.test.js`. Use `factory.owner`/`factory.tower`/`factory.estate`/`factory.unit` + `tokens` from `helpers.js` (read them first). `factory.unit(ownerId, over)` creates a unit; give it a tower for location. Skeleton:
```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function aUnit(over = {}) {
  const owner = await factory.owner();
  return factory.unit(owner.id, { unitNumber: "12A", building: "Maven", type: "2BR", baseRent: 45000, sizeSqm: 58, ...over });
}
const staff = () => ({ Authorization: `Bearer ${tokens.officer()}` });

describe("Unit listing — get/update", () => {
  it("synthesizes a default listing pre-filled from the unit when none exists", async () => {
    const u = await aUnit();
    const res = await request(app).get(`/api/unit-listings/${u.id}`).set(staff());
    expect(res.status).toBe(200);
    expect(res.body.listing.published).toBe(false);
    expect(res.body.listing.details.unitNumber).toBe("12A");
    expect(res.body.listing.details.rentalRate).toBe(45000);
    expect(Array.isArray(res.body.listing.visibleFields)).toBe(true);
    expect(res.body.photos).toEqual([]);
  });

  it("updates details + visibleFields (upsert) and rejects unknown keys", async () => {
    const u = await aUnit();
    const ok = await request(app).patch(`/api/unit-listings/${u.id}`).set(staff())
      .send({ details: { bedrooms: 2, bathrooms: 1, amenities: ["Pool", "Gym"] }, visibleFields: ["unitNumber", "bedrooms"] });
    expect(ok.status).toBe(200);
    expect(ok.body.listing.details.bedrooms).toBe(2);
    const bad = await request(app).patch(`/api/unit-listings/${u.id}`).set(staff()).send({ details: { sneaky: "x" } });
    expect(bad.status).toBe(400);
    const badVis = await request(app).patch(`/api/unit-listings/${u.id}`).set(staff()).send({ visibleFields: ["nope"] });
    expect(badVis.status).toBe(400);
  });

  it("viewer can GET but not PATCH (403); unknown unit 404", async () => {
    const u = await aUnit();
    const v = await request(app).get(`/api/unit-listings/${u.id}`).set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(v.status).toBe(200);
    const w = await request(app).patch(`/api/unit-listings/${u.id}`).set("Authorization", `Bearer ${tokens.viewer()}`).send({ headline: "x" });
    expect(w.status).toBe(403);
    const nf = await request(app).get(`/api/unit-listings/does-not-exist`).set(staff());
    expect(nf.status).toBe(404);
  });
});
```
> If `factory.unit` signature differs, adapt; read `server/tests/helpers.js`.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/unitListings.test.js` → FAIL.

- [ ] **Step 3: Validation**

Create `server/src/validation/unitListing.js`:
```js
import { z } from "zod";
export const updateListingSchema = z.object({
  details: z.record(z.any()).optional(),
  visibleFields: z.array(z.string()).optional(),
  headline: z.string().optional().nullable(),
});
export const reorderSchema = z.object({ orderedIds: z.array(z.string()).min(1) });
export const captionSchema = z.object({ caption: z.string().optional().nullable() });
export const coverSchema = z.object({ photoId: z.string() });
```

- [ ] **Step 4: Service (get/update)**

Create `server/src/services/unitListingService.js`:
```js
import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError, ConflictError } from "../lib/errors.js";
import { UNIT_LISTING_FIELDS, DEFAULT_VISIBLE_FIELDS, isListingFieldKey } from "../../../shared/unitListingFields.js";

const PHOTO_META = { id: true, mimeType: true, size: true, caption: true, sortOrder: true, createdByName: true, createdAt: true };

async function resolveName(user) {
  if (user?.userId) {
    const u = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true, email: true } });
    if (u) return u.name || u.email || null;
  }
  return null;
}
async function loadUnit(unitId) {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: { tower: { select: { name: true, estate: { select: { id: true, name: true } } } } },
  });
  if (!unit) throw new NotFoundError("Unit not found");
  return unit;
}
function defaultDetails(unit) {
  const d = {};
  for (const f of UNIT_LISTING_FIELDS) {
    if (f.fromUnit && unit[f.fromUnit] != null) d[f.key] = f.type === "number" ? Number(unit[f.fromUnit]) : String(unit[f.fromUnit]);
  }
  if (!d.location) d.location = [unit.tower?.name, unit.tower?.estate?.name].filter(Boolean).join(", ") || null;
  return d;
}
function unitCore(unit) {
  return { id: unit.id, unitNumber: unit.unitNumber, building: unit.building, type: unit.type,
    status: unit.status, approvalStatus: unit.approvalStatus,
    towerName: unit.tower?.name || null, estate: unit.tower?.estate || null };
}

export async function getForUnit(unitId) {
  const unit = await loadUnit(unitId);
  const listing = await prisma.unitListing.findUnique({ where: { unitId } });
  const photos = await prisma.unitPhoto.findMany({ where: { unitId }, orderBy: { sortOrder: "asc" }, select: PHOTO_META });
  const effective = listing || {
    unitId, published: false, publishedAt: null, headline: null,
    details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS, coverPhotoId: null,
  };
  return { unit: unitCore(unit), listing: effective, photos };
}

export async function updateListing(user, unitId, { details, visibleFields, headline }) {
  const unit = await loadUnit(unitId);
  if (details) for (const k of Object.keys(details)) if (!isListingFieldKey(k)) throw new InvalidReferenceError(`Unknown detail field "${k}"`);
  if (visibleFields) for (const k of visibleFields) if (!isListingFieldKey(k)) throw new InvalidReferenceError(`Unknown field "${k}"`);
  const existing = await prisma.unitListing.findUnique({ where: { unitId } });
  const data = {
    details: details ?? existing?.details ?? defaultDetails(unit),
    visibleFields: visibleFields ?? existing?.visibleFields ?? DEFAULT_VISIBLE_FIELDS,
    headline: headline !== undefined ? headline : existing?.headline ?? null,
  };
  const listing = await prisma.unitListing.upsert({ where: { unitId }, create: { unitId, ...data }, update: data });
  return getForUnit(unitId);
}
```
Keep `resolveName`/`PHOTO_META`/`ConfictError`(sic) available for Tasks 4-5 (photos/publish reuse them). `resolveName` is used by `addPhoto` in Task 4.

- [ ] **Step 5: Controller**

Create `server/src/controllers/unitListingController.js`:
```js
import * as svc from "../services/unitListingService.js";
import { updateListingSchema } from "../validation/unitListing.js";

export async function get(req, res, next) {
  try { res.json(await svc.getForUnit(req.params.unitId)); } catch (e) { next(e); }
}
export async function update(req, res, next) {
  try { res.json(await svc.updateListing(req.user, req.params.unitId, updateListingSchema.parse(req.body))); } catch (e) { next(e); }
}
```

- [ ] **Step 6: Routes + mount**

Create `server/src/routes/unitListingRoutes.js`:
```js
import { Router } from "express";
import { verifyJwt, requireRole, requireWrite } from "../middleware/auth.js";
import * as ctrl from "../controllers/unitListingController.js";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const r = Router();
r.use(verifyJwt);
r.get("/:unitId", requireRole(...STAFF), ctrl.get);
r.patch("/:unitId", requireWrite, ctrl.update);
export default r;
```
In `server/src/app.js` add `import unitListingRoutes from "./routes/unitListingRoutes.js";` and `app.use("/api/unit-listings", unitListingRoutes);` alongside the others.

- [ ] **Step 7: Run — verify pass, then full server suite**
```bash
npx vitest run tests/unitListings.test.js
npx vitest run
```

- [ ] **Step 8: Commit**
```bash
git add server/src/services/unitListingService.js server/src/validation/unitListing.js server/src/controllers/unitListingController.js server/src/routes/unitListingRoutes.js server/src/app.js server/tests/unitListings.test.js
git commit -m "feat(unit-listing): get/update listing details + visible fields"
```

---

### Task 4: Photos — add, delete, reorder, caption, set cover

**Files:**
- Modify: `server/src/services/unitListingService.js`, `server/src/controllers/unitListingController.js`, `server/src/routes/unitListingRoutes.js`
- Test: `server/tests/unitListings.test.js` (extend)

**Interfaces:**
- Produces service fns: `addPhoto(user, unitId, file)`, `deletePhoto(user, unitId, photoId)`, `reorderPhotos(user, unitId, orderedIds)`, `updatePhotoCaption(user, unitId, photoId, caption)`, `setCover(user, unitId, photoId)`, `getPhotoForStaff(unitId, photoId)`; routes `POST /:unitId/photos`, `DELETE /:unitId/photos/:photoId`, `PATCH /:unitId/photos/reorder`, `PATCH /:unitId/photos/:photoId`, `PATCH /:unitId/cover`, `GET /:unitId/photos/:photoId/image`.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/unitListings.test.js`. A 1x1 PNG buffer for uploads:
```js
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5c0000000049454e44ae426082", "hex");

describe("Unit listing — photos", () => {
  async function withPhoto() {
    const owner = await factory.owner();
    const u = await factory.unit(owner.id, { unitNumber: "5C", baseRent: 30000 });
    const up = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff())
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    return { u, photoId: up.body.id, up };
  }

  it("uploads a photo with incrementing sortOrder + createdByName", async () => {
    const { u, up } = await withPhoto();
    expect(up.status).toBe(201);
    expect(up.body.sortOrder).toBe(1);
    expect(up.body.createdByName).toBeDefined?.() ?? expect(up.body).toHaveProperty("createdByName");
    const up2 = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "b.png", contentType: "image/png" });
    expect(up2.body.sortOrder).toBe(2);
    // no bytes in the metadata payload
    expect(up.body.data).toBeUndefined();
  });

  it("rejects a non-image upload (400)", async () => {
    const owner = await factory.owner(); const u = await factory.unit(owner.id, { baseRent: 1 });
    const res = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff())
      .attach("file", Buffer.from("not an image"), { filename: "x.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("serves the staff image bytes", async () => {
    const { u, photoId } = await withPhoto();
    const img = await request(app).get(`/api/unit-listings/${u.id}/photos/${photoId}/image`).set(staff());
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toContain("image/png");
  });

  it("reorders, captions, sets cover, and deletes (foreign photo 404)", async () => {
    const { u, photoId } = await withPhoto();
    const p2 = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "b.png", contentType: "image/png" });
    const reo = await request(app).patch(`/api/unit-listings/${u.id}/photos/reorder`).set(staff()).send({ orderedIds: [p2.body.id, photoId] });
    expect(reo.status).toBe(200);
    expect(reo.body.photos[0].id).toBe(p2.body.id);
    const cap = await request(app).patch(`/api/unit-listings/${u.id}/photos/${photoId}`).set(staff()).send({ caption: "Living room" });
    expect(cap.body.photos.find((p) => p.id === photoId).caption).toBe("Living room");
    const cov = await request(app).patch(`/api/unit-listings/${u.id}/cover`).set(staff()).send({ photoId });
    expect(cov.status).toBe(200);
    expect(cov.body.listing.coverPhotoId).toBe(photoId);
    // foreign photo id 404
    const other = await factory.owner().then((o) => factory.unit(o.id, { baseRent: 1 }));
    const bad = await request(app).delete(`/api/unit-listings/${other.id}/photos/${photoId}`).set(staff());
    expect(bad.status).toBe(404);
    // delete the cover clears coverPhotoId
    const del = await request(app).delete(`/api/unit-listings/${u.id}/photos/${photoId}`).set(staff());
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/unit-listings/${u.id}`).set(staff());
    expect(after.body.listing.coverPhotoId).toBeNull();
  });
});
```
> Adjust the `createdByName` assertion to a plain `expect(up.body).toHaveProperty("createdByName")` — remove the `toBeDefined?.()` pseudo-code; that was illustrative.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/unitListings.test.js -t "photos"` → FAIL.

- [ ] **Step 3: Add service functions**

Append to `server/src/services/unitListingService.js`:
```js
async function assertPhotoInUnit(unitId, photoId) {
  const photo = await prisma.unitPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.unitId !== unitId) throw new NotFoundError("Photo not found");
  return photo;
}

export async function addPhoto(user, unitId, file) {
  await loadUnit(unitId);
  if (!file) throw new InvalidReferenceError("An image file is required");
  const max = await prisma.unitPhoto.aggregate({ where: { unitId }, _max: { sortOrder: true } });
  const photo = await prisma.unitPhoto.create({
    data: { unitId, data: file.buffer, mimeType: file.mimetype, size: file.size,
      sortOrder: (max._max.sortOrder || 0) + 1, createdById: user?.userId || null, createdByName: await resolveName(user) },
    select: PHOTO_META,
  });
  return photo;
}
export async function deletePhoto(user, unitId, photoId) {
  await assertPhotoInUnit(unitId, photoId);
  await prisma.unitPhoto.delete({ where: { id: photoId } });
  const listing = await prisma.unitListing.findUnique({ where: { unitId } });
  if (listing?.coverPhotoId === photoId) await prisma.unitListing.update({ where: { unitId }, data: { coverPhotoId: null } });
  return getForUnit(unitId);
}
export async function reorderPhotos(user, unitId, orderedIds) {
  await loadUnit(unitId);
  for (const id of orderedIds) await assertPhotoInUnit(unitId, id);
  await prisma.$transaction(orderedIds.map((id, i) => prisma.unitPhoto.update({ where: { id }, data: { sortOrder: i + 1 } })));
  return getForUnit(unitId);
}
export async function updatePhotoCaption(user, unitId, photoId, caption) {
  await assertPhotoInUnit(unitId, photoId);
  await prisma.unitPhoto.update({ where: { id: photoId }, data: { caption: caption ?? null } });
  return getForUnit(unitId);
}
export async function setCover(user, unitId, photoId) {
  await loadUnit(unitId);
  await assertPhotoInUnit(unitId, photoId);
  const data = { coverPhotoId: photoId };
  await prisma.unitListing.upsert({ where: { unitId }, create: { unitId, ...data, details: {}, visibleFields: DEFAULT_VISIBLE_FIELDS }, update: data });
  return getForUnit(unitId);
}
export async function getPhotoForStaff(unitId, photoId) {
  const photo = await assertPhotoInUnit(unitId, photoId);
  const row = await prisma.unitPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true } });
  return row;
}
```

- [ ] **Step 4: Controller handlers**

Add to `server/src/controllers/unitListingController.js` (extend the validation import):
```js
import { updateListingSchema, reorderSchema, captionSchema, coverSchema } from "../validation/unitListing.js";
export async function addPhoto(req, res, next) {
  try { res.status(201).json(await svc.addPhoto(req.user, req.params.unitId, req.file)); } catch (e) { next(e); }
}
export async function deletePhoto(req, res, next) {
  try { res.json(await svc.deletePhoto(req.user, req.params.unitId, req.params.photoId)); } catch (e) { next(e); }
}
export async function reorderPhotos(req, res, next) {
  try { res.json(await svc.reorderPhotos(req.user, req.params.unitId, reorderSchema.parse(req.body).orderedIds)); } catch (e) { next(e); }
}
export async function captionPhoto(req, res, next) {
  try { res.json(await svc.updatePhotoCaption(req.user, req.params.unitId, req.params.photoId, captionSchema.parse(req.body).caption)); } catch (e) { next(e); }
}
export async function setCover(req, res, next) {
  try { res.json(await svc.setCover(req.user, req.params.unitId, coverSchema.parse(req.body).photoId)); } catch (e) { next(e); }
}
export async function staffImage(req, res, next) {
  try {
    const row = await svc.getPhotoForStaff(req.params.unitId, req.params.photoId);
    res.setHeader("Content-Type", row.mimeType); res.setHeader("Cache-Control", "no-store"); res.send(row.data);
  } catch (e) { next(e); }
}
```

- [ ] **Step 5: Routes (literal before param; multer)**

Update `server/src/routes/unitListingRoutes.js` — add multer + the routes, keeping `/:unitId/photos/reorder` and `/:unitId/cover` before the `/:unitId/photos/:photoId` param routes:
```js
import multer from "multer";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ALLOWED.has(file.mimetype)) });
// after r.patch("/:unitId", ...):
r.post("/:unitId/photos", requireWrite, upload.single("file"), ctrl.addPhoto);
r.patch("/:unitId/photos/reorder", requireWrite, ctrl.reorderPhotos);
r.patch("/:unitId/cover", requireWrite, ctrl.setCover);
r.get("/:unitId/photos/:photoId/image", requireRole(...STAFF), ctrl.staffImage);
r.patch("/:unitId/photos/:photoId", requireWrite, ctrl.captionPhoto);
r.delete("/:unitId/photos/:photoId", requireWrite, ctrl.deletePhoto);
```
> A rejected (non-image) upload leaves `req.file` undefined → `addPhoto` throws `InvalidReferenceError` (400). Confirm multer's fileFilter rejection yields no `req.file` (it does with `cb(null, false)`).

- [ ] **Step 6: Run — verify pass, then full suite**
```bash
npx vitest run tests/unitListings.test.js
npx vitest run
```

- [ ] **Step 7: Commit**
```bash
git add server/src/services/unitListingService.js server/src/controllers/unitListingController.js server/src/routes/unitListingRoutes.js server/tests/unitListings.test.js
git commit -m "feat(unit-listing): photo upload/reorder/caption/cover/delete + staff image"
```

---

### Task 5: Publish/unpublish + public read API

**Files:**
- Modify: `server/src/services/unitListingService.js`, `server/src/controllers/unitListingController.js`, `server/src/routes/unitListingRoutes.js`
- Create: `server/src/routes/publicUnitRoutes.js`, `server/src/controllers/publicUnitController.js`
- Modify: `server/src/app.js` (mount `/api/public/units`)
- Test: `server/tests/unitListings.test.js` (extend), `server/tests/publicUnits.test.js` (new)

**Interfaces:**
- Produces service fns: `publish(user, unitId)`, `unpublish(user, unitId)`, `listPublic({ estateId, type })`, `getPublic(unitId)`, `getPhotoBytes(photoId, { requirePublished })`; staff routes `PATCH /:unitId/publish|unpublish`; public routes `GET /api/public/units`, `GET /api/public/units/:unitId`, `GET /api/public/units/photo/:photoId`.

- [ ] **Step 1: Write the failing tests**

Extend `server/tests/unitListings.test.js` with publish guards, and create `server/tests/publicUnits.test.js`:
```js
// in unitListings.test.js
describe("Unit listing — publish", () => {
  it("blocks publish with no photos (409) and when unit not APPROVED (409)", async () => {
    const owner = await factory.owner();
    const u = await factory.unit(owner.id, { baseRent: 1, approvalStatus: "APPROVED" });
    const noPhoto = await request(app).patch(`/api/unit-listings/${u.id}/publish`).set(staff());
    expect(noPhoto.status).toBe(409);
    await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const u2 = await factory.unit(owner.id, { baseRent: 1, approvalStatus: "DRAFT" });
    await request(app).post(`/api/unit-listings/${u2.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const notApproved = await request(app).patch(`/api/unit-listings/${u2.id}/publish`).set(staff());
    expect(notApproved.status).toBe(409);
    const ok = await request(app).patch(`/api/unit-listings/${u.id}/publish`).set(staff());
    expect(ok.status).toBe(200);
    expect(ok.body.listing.published).toBe(true);
    expect(ok.body.listing.publishedAt).toBeTruthy();
    const un = await request(app).patch(`/api/unit-listings/${u.id}/unpublish`).set(staff());
    expect(un.body.listing.published).toBe(false);
  });
});
```
```js
// publicUnits.test.js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5c0000000049454e44ae426082", "hex");
const staff = () => ({ Authorization: `Bearer ${tokens.officer()}` });

async function publishedUnit(over = {}) {
  const owner = await factory.owner();
  const estate = await factory.estate({ name: `E${Math.round(Date.now() % 1e6)}` }); // vary if needed; else pass fixed unique
  const tower = await factory.tower(estate.id, { name: "T1" });
  const u = await factory.unit(owner.id, { unitNumber: "9A", type: "2BR", baseRent: 40000, towerId: tower.id, status: "VACANT", approvalStatus: "APPROVED", ...over });
  const p = await request(app).post(`/api/unit-listings/${u.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
  await request(app).patch(`/api/unit-listings/${u.id}`).set(staff()).send({ visibleFields: ["unitNumber", "unitType", "rentalRate"], details: { unitNumber: "9A", unitType: "2BR", rentalRate: 40000, bedrooms: 2 } });
  await request(app).patch(`/api/unit-listings/${u.id}/publish`).set(staff());
  return { u, estate, tower, photoId: p.body.id };
}

describe("Public units", () => {
  it("lists only published+vacant+approved and carries only visibleFields (no bytes)", async () => {
    const { u } = await publishedUnit();
    // an unpublished unit
    const owner = await factory.owner(); await factory.unit(owner.id, { baseRent: 1, status: "VACANT", approvalStatus: "APPROVED" });
    const res = await request(app).get("/api/public/units");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitId).toBe(u.id);
    expect(res.body[0].details.unitNumber).toBe("9A");
    expect(res.body[0].details.bedrooms).toBeUndefined(); // not in visibleFields
    expect(res.body[0].photoIds.length).toBe(1);
    expect(JSON.stringify(res.body[0])).not.toContain("data");
  });
  it("hides an OCCUPIED unit", async () => {
    const { u } = await publishedUnit();
    await (await import("../src/lib/prisma.js")).prisma.unit.update({ where: { id: u.id }, data: { status: "OCCUPIED" } });
    const res = await request(app).get("/api/public/units");
    expect(res.body).toHaveLength(0);
  });
  it("filters by estate and type", async () => {
    const a = await publishedUnit();
    const res = await request(app).get(`/api/public/units?estateId=${a.estate.id}&type=2BR`);
    expect(res.body).toHaveLength(1);
    const none = await request(app).get(`/api/public/units?type=STUDIO`);
    expect(none.body).toHaveLength(0);
  });
  it("serves a published photo but 404s an unpublished unit's photo and detail", async () => {
    const { photoId } = await publishedUnit();
    const img = await request(app).get(`/api/public/units/photo/${photoId}`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toContain("image/png");
    // unpublished
    const owner = await factory.owner(); const u2 = await factory.unit(owner.id, { baseRent: 1, status: "VACANT", approvalStatus: "APPROVED" });
    const p2 = await request(app).post(`/api/unit-listings/${u2.id}/photos`).set(staff()).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    const hidden = await request(app).get(`/api/public/units/photo/${p2.body.id}`);
    expect(hidden.status).toBe(404);
    const hiddenDetail = await request(app).get(`/api/public/units/${u2.id}`);
    expect(hiddenDetail.status).toBe(404);
  });
});
```
> `factory.estate` needs a unique name; if the helper doesn't auto-unique, pass an explicit unique string per test. Read `helpers.js` and adapt.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/publicUnits.test.js tests/unitListings.test.js` → FAIL.

- [ ] **Step 3: Service (publish + public reads)**

Append to `server/src/services/unitListingService.js`:
```js
function cardDetails(listing) {
  const details = listing.details || {};
  const visible = Array.isArray(listing.visibleFields) ? listing.visibleFields : [];
  const out = {};
  for (const k of visible) if (details[k] !== undefined) out[k] = details[k];
  return out;
}

export async function publish(user, unitId) {
  const unit = await loadUnit(unitId);
  if (unit.approvalStatus !== "APPROVED") throw new ConflictError("Only an approved unit can be published");
  const count = await prisma.unitPhoto.count({ where: { unitId } });
  if (count === 0) throw new ConflictError("Add at least one photo before publishing");
  await prisma.unitListing.upsert({
    where: { unitId },
    create: { unitId, published: true, publishedAt: new Date(), details: defaultDetails(unit), visibleFields: DEFAULT_VISIBLE_FIELDS },
    update: { published: true, publishedAt: new Date() },
  });
  return getForUnit(unitId);
}
export async function unpublish(user, unitId) {
  await loadUnit(unitId);
  await prisma.unitListing.upsert({
    where: { unitId }, create: { unitId, published: false, details: {}, visibleFields: DEFAULT_VISIBLE_FIELDS },
    update: { published: false },
  });
  return getForUnit(unitId);
}

const PUBLIC_WHERE = (extra = {}) => ({
  published: true,
  unit: { is: { status: "VACANT", approvalStatus: "APPROVED", ...extra } },
});

export async function listPublic({ estateId, type } = {}) {
  const unitFilter = {};
  if (type) unitFilter.type = type;
  if (estateId) unitFilter.tower = { is: { estateId } };
  const listings = await prisma.unitListing.findMany({
    where: { published: true, unit: { is: { status: "VACANT", approvalStatus: "APPROVED", ...unitFilter } } },
    include: { unit: { select: { id: true, type: true, tower: { select: { name: true, estate: { select: { id: true, name: true } } } } } } },
    orderBy: { publishedAt: "desc" },
  });
  const cards = [];
  for (const l of listings) {
    const photos = await prisma.unitPhoto.findMany({ where: { unitId: l.unitId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    const photoIds = photos.map((p) => p.id);
    cards.push({
      unitId: l.unitId, headline: l.headline, type: l.unit.type,
      location: [l.unit.tower?.name, l.unit.tower?.estate?.name].filter(Boolean).join(", ") || null,
      estate: l.unit.tower?.estate || null,
      details: cardDetails(l),
      coverPhotoId: l.coverPhotoId && photoIds.includes(l.coverPhotoId) ? l.coverPhotoId : (photoIds[0] || null),
      photoIds,
    });
  }
  return cards;
}
export async function getPublic(unitId) {
  const l = await prisma.unitListing.findUnique({
    where: { unitId },
    include: { unit: { select: { id: true, type: true, status: true, approvalStatus: true, tower: { select: { name: true, estate: { select: { id: true, name: true } } } } } } },
  });
  if (!l || !l.published || l.unit.status !== "VACANT" || l.unit.approvalStatus !== "APPROVED") throw new NotFoundError("Unit not found");
  const photos = await prisma.unitPhoto.findMany({ where: { unitId }, orderBy: { sortOrder: "asc" }, select: { id: true, caption: true } });
  const photoIds = photos.map((p) => p.id);
  return {
    unitId, headline: l.headline, type: l.unit.type,
    location: [l.unit.tower?.name, l.unit.tower?.estate?.name].filter(Boolean).join(", ") || null,
    details: cardDetails(l), photos, photoIds,
    coverPhotoId: l.coverPhotoId && photoIds.includes(l.coverPhotoId) ? l.coverPhotoId : (photoIds[0] || null),
  };
}
export async function getPhotoBytes(photoId, { requirePublished } = {}) {
  const photo = await prisma.unitPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true, unitId: true } });
  if (!photo) throw new NotFoundError("Photo not found");
  if (requirePublished) {
    const l = await prisma.unitListing.findUnique({ where: { unitId: photo.unitId }, include: { unit: { select: { status: true, approvalStatus: true } } } });
    if (!l || !l.published || l.unit.status !== "VACANT" || l.unit.approvalStatus !== "APPROVED") throw new NotFoundError("Photo not found");
  }
  return { data: photo.data, mimeType: photo.mimeType };
}
```
> Remove the unused `PUBLIC_WHERE` helper if you don't reference it — it's illustrative; `listPublic` inlines the filter.

- [ ] **Step 4: Staff publish controller + routes**

Add to `unitListingController.js`:
```js
export async function publish(req, res, next) {
  try { res.json(await svc.publish(req.user, req.params.unitId)); } catch (e) { next(e); }
}
export async function unpublish(req, res, next) {
  try { res.json(await svc.unpublish(req.user, req.params.unitId)); } catch (e) { next(e); }
}
```
Add to `unitListingRoutes.js` (after the cover route):
```js
r.patch("/:unitId/publish", requireWrite, ctrl.publish);
r.patch("/:unitId/unpublish", requireWrite, ctrl.unpublish);
```

- [ ] **Step 5: Public controller + routes + mount**

Create `server/src/controllers/publicUnitController.js`:
```js
import * as svc from "../services/unitListingService.js";
export async function list(req, res, next) {
  try { res.json(await svc.listPublic({ estateId: req.query.estateId, type: req.query.type })); } catch (e) { next(e); }
}
export async function detail(req, res, next) {
  try { res.json(await svc.getPublic(req.params.unitId)); } catch (e) { next(e); }
}
export async function photo(req, res, next) {
  try {
    const row = await svc.getPhotoBytes(req.params.photoId, { requirePublished: true });
    res.setHeader("Content-Type", row.mimeType); res.setHeader("Cache-Control", "public, max-age=300"); res.send(row.data);
  } catch (e) { next(e); }
}
```
Create `server/src/routes/publicUnitRoutes.js` (NO `verifyJwt`; literal `photo` before `:unitId`):
```js
import { Router } from "express";
import * as ctrl from "../controllers/publicUnitController.js";
const r = Router();
r.get("/", ctrl.list);
r.get("/photo/:photoId", ctrl.photo);
r.get("/:unitId", ctrl.detail);
export default r;
```
In `server/src/app.js`: `import publicUnitRoutes from "./routes/publicUnitRoutes.js";` and `app.use("/api/public/units", publicUnitRoutes);`.

- [ ] **Step 6: Run — verify pass, then full suite**
```bash
npx vitest run tests/unitListings.test.js tests/publicUnits.test.js
npx vitest run
```

- [ ] **Step 7: Commit**
```bash
git add server/src/services/unitListingService.js server/src/controllers/unitListingController.js server/src/controllers/publicUnitController.js server/src/routes/unitListingRoutes.js server/src/routes/publicUnitRoutes.js server/src/app.js server/tests/unitListings.test.js server/tests/publicUnits.test.js
git commit -m "feat(unit-listing): publish/unpublish + public read API"
```

---

### Task 6: Client resource wrapper

**Files:**
- Modify: `client/src/lib/resource.js`
- Test: `client/tests/resource.test.js` (extend)

**Interfaces:**
- Produces: `unitListings` with `get(unitId)`, `update(unitId, body)`, `addPhoto(unitId, file)`, `deletePhoto(unitId, photoId)`, `reorder(unitId, orderedIds)`, `caption(unitId, photoId, caption)`, `setCover(unitId, photoId)`, `publish(unitId)`, `unpublish(unitId)`, `staffImageUrl(unitId, photoId)`; and `publicUnits` with `list(params)`, `get(unitId)`, `photoUrl(photoId)`.

- [ ] **Step 1: Write the failing test**

Extend `client/tests/resource.test.js` (match its mock harness). Assert URLs/verbs:
```js
it("unitListings + publicUnits wrappers hit the right endpoints", async () => {
  const { unitListings, publicUnits } = await import("../src/lib/resource.js");
  await unitListings.get("u1"); expect(api.get).toHaveBeenCalledWith("/unit-listings/u1");
  await unitListings.update("u1", { headline: "x" }); expect(api.patch).toHaveBeenCalledWith("/unit-listings/u1", { headline: "x" });
  await unitListings.reorder("u1", ["a", "b"]); expect(api.patch).toHaveBeenCalledWith("/unit-listings/u1/photos/reorder", { orderedIds: ["a", "b"] });
  await unitListings.setCover("u1", "p1"); expect(api.patch).toHaveBeenCalledWith("/unit-listings/u1/cover", { photoId: "p1" });
  await unitListings.publish("u1"); expect(api.patch).toHaveBeenCalledWith("/unit-listings/u1/publish");
  await publicUnits.list({ type: "2BR" }); expect(api.get).toHaveBeenCalledWith("/public/units", { params: { type: "2BR" } });
  expect(publicUnits.photoUrl("p1")).toBe("/api/public/units/photo/p1");
});
```
> Match how existing wrappers call `api.patch` with no body (e.g. `advance`) — they pass `data || {}`. For `publish`/`unpublish` (no body) use `api.patch(url)` and assert `toHaveBeenCalledWith(url)` (single arg). If the file's convention is `api.patch(url, {})`, match that and assert accordingly.

- [ ] **Step 2: Run — verify fail** (from `client/`) `npx vitest run tests/resource.test.js -t "unitListings"` → FAIL.

- [ ] **Step 3: Add the wrappers**

In `client/src/lib/resource.js` (match the `.then((r) => r.data)` convention; uploads use FormData like `lessorRequirements`):
```js
export const unitListings = {
  get: (unitId) => api.get(`/unit-listings/${unitId}`).then((r) => r.data),
  update: (unitId, body) => api.patch(`/unit-listings/${unitId}`, body).then((r) => r.data),
  addPhoto: (unitId, file) => { const form = new FormData(); form.append("file", file); return api.post(`/unit-listings/${unitId}/photos`, form).then((r) => r.data); },
  deletePhoto: (unitId, photoId) => api.delete(`/unit-listings/${unitId}/photos/${photoId}`).then((r) => r.data),
  reorder: (unitId, orderedIds) => api.patch(`/unit-listings/${unitId}/photos/reorder`, { orderedIds }).then((r) => r.data),
  caption: (unitId, photoId, caption) => api.patch(`/unit-listings/${unitId}/photos/${photoId}`, { caption }).then((r) => r.data),
  setCover: (unitId, photoId) => api.patch(`/unit-listings/${unitId}/cover`, { photoId }).then((r) => r.data),
  publish: (unitId) => api.patch(`/unit-listings/${unitId}/publish`).then((r) => r.data),
  unpublish: (unitId) => api.patch(`/unit-listings/${unitId}/unpublish`).then((r) => r.data),
  staffImageUrl: (unitId, photoId) => `/api/unit-listings/${unitId}/photos/${photoId}/image`,
};
export const publicUnits = {
  list: (params) => api.get("/public/units", { params }).then((r) => r.data),
  get: (unitId) => api.get(`/public/units/${unitId}`).then((r) => r.data),
  photoUrl: (photoId) => `/api/public/units/photo/${photoId}`,
};
```
> `staffImageUrl` returns a raw path; the staff view fetches it as a blob (with the auth token) for display — see Task 7. The public `photoUrl` is used directly in `<img src>` (no auth needed).

- [ ] **Step 4: Run — verify pass, full client suite**  `npx vitest run tests/resource.test.js` then `npx vitest run`.

- [ ] **Step 5: Commit**
```bash
git add client/src/lib/resource.js client/tests/resource.test.js
git commit -m "feat(unit-listing): client resource wrappers (staff + public)"
```

---

### Task 7: Staff management view

**Files:**
- Create: `client/src/views/UnitListingView.vue`
- Modify: `client/src/router/index.js` (route), `client/src/views/UnitsView.vue` (entry link)
- Test: `client/tests/UnitListingView.test.js` (new)

**Interfaces:**
- Consumes: `unitListings` resource; `UNIT_LISTING_FIELDS` from `../../../shared/unitListingFields.js`; `api` (for authed image blobs).

- [ ] **Step 1: Write the failing test**

Create `client/tests/UnitListingView.test.js`. Mock `../src/lib/resource.js` and `vue-router`'s `useRoute` (params.id). Skeleton:
```js
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "u1" } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(() => Promise.resolve({ data: new ArrayBuffer(8) })) } }));
vi.mock("../src/lib/resource.js", () => ({
  unitListings: {
    get: vi.fn(() => Promise.resolve({
      unit: { id: "u1", unitNumber: "12A", status: "VACANT", approvalStatus: "APPROVED" },
      listing: { published: false, details: { unitNumber: "12A", bedrooms: 2 }, visibleFields: ["unitNumber"], coverPhotoId: null },
      photos: [{ id: "p1", caption: null, sortOrder: 1 }],
    })),
    update: vi.fn(() => Promise.resolve({})), addPhoto: vi.fn(() => Promise.resolve({})),
    deletePhoto: vi.fn(), reorder: vi.fn(), caption: vi.fn(), setCover: vi.fn(() => Promise.resolve({})),
    publish: vi.fn(() => Promise.resolve({})), unpublish: vi.fn(),
    staffImageUrl: (u, p) => `/api/unit-listings/${u}/photos/${p}/image`,
  },
}));
import UnitListingView from "../src/views/UnitListingView.vue";
import { unitListings } from "../src/lib/resource.js";

describe("UnitListingView", () => {
  it("renders photos + details editor and can set cover + publish", async () => {
    const w = mount(UnitListingView);
    await flushPromises();
    expect(w.text()).toContain("12A");
    // a details input for a catalog field exists
    expect(w.find("input, textarea").exists()).toBe(true);
    // set cover
    const cover = w.findAll("button").find((b) => /cover/i.test(b.text()));
    if (cover) { await cover.trigger("click"); await flushPromises(); expect(unitListings.setCover).toHaveBeenCalledWith("u1", "p1"); }
    // publish
    const pub = w.findAll("button").find((b) => /publish/i.test(b.text()));
    await pub.trigger("click"); await flushPromises();
    expect(unitListings.publish).toHaveBeenCalledWith("u1");
  });
});
```
> Adapt selectors to your final markup; keep the assertions on the resource calls.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/UnitListingView.test.js` → FAIL.

- [ ] **Step 3: Build the view**

Create `client/src/views/UnitListingView.vue` (`<script setup>`, scoped styles, app button classes, badge styles like `InfoSheetsStaff.vue`). Requirements:
- On mount, `unitListings.get(route.params.id)` → keep `unit`, `listing` (reactive copies of `details`, `visibleFields`, `headline`), `photos`.
- **Photos section**: a file input (`accept="image/*"`) → on change call `unitListings.addPhoto(unitId, file)` then reload. A thumbnail grid: each photo shows its image (fetch the authed blob — see below), a **Set cover** button (calls `setCover`, star the current `listing.coverPhotoId`), a caption input (blur → `caption`), **↑/↓** reorder buttons (compute the new order of ids and call `reorder`), and **Delete** (calls `deletePhoto`). A ◀/▶ preview cycling the photos.
- **Authed image display**: for each photo, GET `unitListings.staffImageUrl(unitId, photoId)` via `api.get(url, { responseType: "blob" })` → `URL.createObjectURL` → bind to `<img :src>`. Revoke object URLs on unmount. (Mirror `InfoSheetsStaff.vue`'s blob handling.)
- **Details editor**: iterate `UNIT_LISTING_FIELDS`; render an input by `type` (text/number/textarea; `list` = comma-separated text mapped to an array); bind to a local `details` copy. A **visible fields** checklist (checkbox per field bound to a local `visibleFields` array). A **Save** button → `unitListings.update(unitId, { details, visibleFields, headline })` then reload.
- **Publish**: a Publish/Unpublish button reflecting `listing.published`; disabled with a tooltip when `photos.length === 0`; calls `publish`/`unpublish` then reload. Show published state + date. Surface server 409 messages in an error line.
- Guard everything in try/catch with an `.error` line.

- [ ] **Step 4: Router + entry link**

In `client/src/router/index.js`, import `UnitListingView` and add under `/app`:
```js
{ path: "units/:id/listing", component: UnitListingView, meta: { roles: WRITE } },
```
In `client/src/views/UnitsView.vue`, add a per-row link/button "Listing & photos" → `router.push('/app/units/' + row.id + '/listing')` (match how the file builds row actions).

- [ ] **Step 5: Run — verify pass, full client suite**  `npx vitest run tests/UnitListingView.test.js` then `npx vitest run`.

- [ ] **Step 6: Commit**
```bash
git add client/src/views/UnitListingView.vue client/src/router/index.js client/src/views/UnitsView.vue client/tests/UnitListingView.test.js
git commit -m "feat(unit-listing): staff listing & photo management view"
```

---

## Self-Review

**Spec coverage:** catalog (T1) ✓; models+migration (T2) ✓; get/update details+visibleFields (T3) ✓; photos add/delete/reorder/caption/cover + staff image (T4) ✓; publish guards + public list/detail/photo (T5) ✓; resource wrappers (T6) ✓; staff view + entry (T7) ✓. Error cases: unknown key 400, non-image 400, publish guards 409, foreign photo 404, public draft 404, role 403 — all in T3–T5 tests.

**Type consistency:** service helpers (`loadUnit`, `defaultDetails`, `cardDetails`, `resolveName`, `assertPhotoInUnit`, `PHOTO_META`) defined in T3–T4 and reused in T4–T5. Every service write returns `getForUnit(unitId)` so staff responses share one shape. Resource method names (T6) match the routes (T3–T5). `staffImageUrl` returns a path fetched as a blob in T7; public `photoUrl` used directly.

**Adaptation points flagged inline:** `factory.unit`/`factory.estate` signatures (T3/T5 tests), resource mock harness (T6), `UnitsView` row-action style + `useRoute` mock (T7). Illustrative pseudo-code (`toBeDefined?.()`, unused `PUBLIC_WHERE`) is called out to remove.

**Migration caveat:** additive SQL, not a migrate file (history drift). Deploys run the SQL per environment.
