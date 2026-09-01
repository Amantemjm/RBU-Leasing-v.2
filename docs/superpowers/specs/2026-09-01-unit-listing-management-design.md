# Unit Listing & Photo Management — Design Spec

**Date:** 2026-09-01
**Status:** Approved (design), pending implementation plan
**Sub-project:** I of the "Unit Photos & Available Units for Lease" module (staff side + data model + read API). Sub-project J builds the public browsing UI on top of this.
**Area:** New `UnitPhoto` + `UnitListing` models/migration + shared field catalog + server service/routes + staff management view + public read API.

## Problem

After a unit's photoshoot, O-Lease/Admins have nowhere in the system to upload and manage the unit's photos, curate the details shown to prospective lessees, or decide when a unit is publicly listed. The core `Unit` record holds only internal fields (unitNumber, tower, type, sizeSqm, baseRent, status) — no photos, no display-oriented details (bedrooms, bathrooms, amenities, description), and no publish state.

## Goal

A staff-facing module to: upload/manage a unit's photos (reorder, set cover, caption, delete), edit the unit's displayed details, configure which details appear on its card, and publish/unpublish it — backed by a data model and a read API that sub-project J's public page will consume.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Details location | A **separate `UnitListing`** entity (1:1 with Unit) holding presentation + config; core `Unit` untouched. |
| Photo storage | **Bytes in Postgres** (`UnitPhoto`), consistent with every other file in the system. |
| Publish gate | **Manual** publish/unpublish by staff; photoshoot-complete only prompts. |
| Public filters | Simple (estate/location + unit type) — the filter *fields* are defined here; the public UI is J. |

## Non-goals

- The public browsing UI (grid/carousel/detail page) — that is sub-project J.
- Rich filters (price/beds/amenities), inquiry-from-card wiring, image resizing/thumbnails/CDN, virtual tours.
- Auto-listing on photoshoot completion (manual publish chosen).

## Architecture

### 1. Shared field catalog (`shared/unitListingFields.js`)

The canonical list of displayable detail fields — drives the staff editor, the card renderer (J), and server-side validation:

```js
export const UNIT_LISTING_FIELDS = [
  { key: "propertyName",      label: "Property / Building Name", type: "text",     fromUnit: "building" },
  { key: "unitNumber",        label: "Unit Number",             type: "text",     fromUnit: "unitNumber" },
  { key: "location",          label: "Location",                type: "text" },
  { key: "unitType",          label: "Unit Type",               type: "text",     fromUnit: "type" },
  { key: "floorArea",         label: "Floor Area (sqm)",        type: "number",   fromUnit: "sizeSqm" },
  { key: "bedrooms",          label: "Bedrooms",                type: "number" },
  { key: "bathrooms",         label: "Bathrooms",               type: "number" },
  { key: "rentalRate",        label: "Rental Rate",             type: "number",   fromUnit: "baseRent" },
  { key: "amenities",         label: "Amenities & Features",    type: "list" },
  { key: "description",       label: "Unit Description",        type: "textarea" },
  { key: "availabilityStatus",label: "Availability Status",     type: "text" },
];
export const UNIT_LISTING_FIELD_KEYS = UNIT_LISTING_FIELDS.map((f) => f.key);
// Fields shown on a card by default when a listing is first created.
export const DEFAULT_VISIBLE_FIELDS = ["propertyName", "unitNumber", "location", "unitType", "floorArea", "bedrooms", "bathrooms", "rentalRate"];
export function isListingFieldKey(key) { return UNIT_LISTING_FIELD_KEYS.includes(key); }
```

### 2. Data model (`server/prisma/schema.prisma` + additive SQL)

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
  details       Json     @default("{}")   // { <fieldKey>: value } from the catalog
  visibleFields Json     @default("[]")   // string[] of catalog keys shown on the card
  coverPhotoId  String?                    // a UnitPhoto id; validated to belong to this unit
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```
Add back-relations to `model Unit`: `photos UnitPhoto[]` and `listing UnitListing?`. `coverPhotoId` is a plain string (not a Prisma relation) validated in the service — avoids a circular relation and delete-ordering complexity. Because the repo's Prisma migration history is diverged (see [[prisma-migration-drift]]), apply the two tables via idempotent SQL (`server/prisma/manual-migrations/2026-09-01-unit-listings.sql`, `CREATE TABLE IF NOT EXISTS`) to dev + test, then `prisma generate` — NOT `prisma migrate dev`.

### 3. Server — `unitListingService.js`

- `getForUnit(unitId)` — loads the unit; returns `{ unit: <core display fields>, listing, photos }`. If no `UnitListing` row exists, returns a **default listing** synthesized (not persisted) from the unit: `details` pre-filled from `fromUnit` mappings, `visibleFields = DEFAULT_VISIBLE_FIELDS`, `published: false`. Photos are metadata only (never bytes).
- `updateListing(user, unitId, { details, visibleFields, headline })` — **upserts** the row; validates every `details` key and every `visibleFields` entry with `isListingFieldKey` (unknown key → 400); `visibleFields` must be an array of known keys.
- `addPhoto(user, unitId, file)` — appends a `UnitPhoto` with `sortOrder = (max for unit) + 1`, stamping `createdByName`. Validated image mime (jpeg/png/webp) via multer.
- `deletePhoto(user, unitId, photoId)` — deletes it (scoped to the unit); if it was the cover, clears `coverPhotoId`.
- `reorderPhotos(user, unitId, orderedIds)` — sets `sortOrder` by the given id order; ids must all belong to the unit.
- `updatePhotoCaption(user, unitId, photoId, caption)`.
- `setCover(user, unitId, photoId)` — validates the photo belongs to the unit; sets `coverPhotoId` (upserting the listing).
- `publish(user, unitId)` — requires the unit `approvalStatus === "APPROVED"` and **≥1 photo** (else 409); sets `published: true`, `publishedAt: now`. `unpublish(user, unitId)` — `published: false`.
- **Public reads** (no bytes leak, published-only):
  - `listPublic({ estateId, type })` — units that are `published` AND `status === "VACANT"` AND `approvalStatus === "APPROVED"`, optionally filtered by estate (via tower→estate) and unit `type`. Returns card DTOs: `{ unitId, headline, details (only visibleFields), coverPhotoId, photoIds[], location, type }`.
  - `getPublic(unitId)` — the full detail for one published unit: all `photoIds` in order, `headline`, the full configured `details` (visibleFields), cover.
  - `getPhotoBytes(photoId, { requirePublished })` — returns `{ data, mimeType }`; if `requirePublished`, 404 unless the owning unit's listing is published.

### 4. Routes

**Staff `/api/unit-listings`** (`verifyJwt`; reads allow STAFF incl. VIEWER, writes `requireWrite`; multer memory image upload, ≤10 MB, jpeg/png/webp):
- `GET /:unitId` — the management payload (unit + listing + photos).
- `PATCH /:unitId` — update details/visibleFields/headline.
- `POST /:unitId/photos` — `upload.single("file")` add a photo.
- `DELETE /:unitId/photos/:photoId`.
- `PATCH /:unitId/photos/reorder` — `{ orderedIds: string[] }`.
- `PATCH /:unitId/photos/:photoId` — `{ caption }`.
- `PATCH /:unitId/cover` — `{ photoId }`.
- `PATCH /:unitId/publish` and `PATCH /:unitId/unpublish`.
- `GET /:unitId/photos/:photoId/image` — staff image (any listing, incl. drafts).

**Public `/api/public/units`** (no auth):
- `GET /` — `?estateId=&type=` → card DTOs (published/vacant/approved only).
- `GET /:unitId` — full public detail (404 if not published).
- `GET /photo/:photoId` — image bytes (404 unless the owning listing is published).

Mounted in `server/src/app.js`. Route order: literal segments before params. Staff writes captured by the existing audit middleware.

### 5. Client — staff management view

**`UnitListingView.vue`** at `/app/units/:id/listing` (`meta.roles = WRITE`), reachable via a "Manage listing & photos" link from `UnitsView`/`UnitFormView`:
- **Photos**: multi-file upload; a thumbnail grid supporting **reorder** (up/down or drag), **set cover** (star), **caption**, **delete**; a small navigation preview (◀/▶) mirroring the public card.
- **Details editor**: one input per catalog field (text/number/textarea/list), pre-filled from the unit; a **visible-fields** checklist controlling what appears on the card.
- **Publish**: a Publish/Unpublish button with the guard messaging (needs ≥1 photo + approved unit); shows current published state + date.
- **Live card preview** reusing the same card layout J will ship (a lightweight preview here; the shared `UnitCard.vue` lands in J).
- Loads/saves via a `unitListings` resource wrapper (`resource.js`): `get(unitId)`, `update(unitId, body)`, `addPhoto(unitId, file)`, `deletePhoto`, `reorder`, `caption`, `setCover`, `publish`, `unpublish`, and an `imageUrl(unitId, photoId)` helper (authed staff image).

## Data flow

```
Staff: Units → "Manage listing & photos" → GET /api/unit-listings/:unitId
  upload photos → set cover → edit details → choose visible fields → Publish
  -> UnitListing.published = true
Public API (consumed by J): GET /api/public/units[?filters] → cards; GET /:unitId → detail; GET /photo/:id → image
```

## Error handling

- Unknown unit → 404. Unknown detail/visible-field key → 400. Non-image upload or over-size → 400. Missing file on photo upload → 400.
- Publish with 0 photos or a non-APPROVED unit → 409 with a clear message.
- `setCover`/`deletePhoto`/`reorder`/`caption` with a photo id not belonging to the unit → 404.
- Public `GET /:unitId` or `GET /photo/:id` for an unpublished/occupied unit → 404 (no draft leak).
- Non-staff calling staff routes → 403; writes by VIEWER → 403.

## Testing (Vitest / Supertest)

Server:
- `getForUnit` synthesizes a default listing (details pre-filled from the unit, `DEFAULT_VISIBLE_FIELDS`) when none exists; never returns photo bytes.
- `updateListing` upserts and rejects unknown field keys (400) in both `details` and `visibleFields`.
- Photo add sets incrementing `sortOrder` + `createdByName`; reorder applies the given order; delete scoped to unit (foreign photo → 404); deleting the cover clears `coverPhotoId`.
- `setCover` validates ownership; publish blocked with 0 photos (409) and when unit not APPROVED (409); succeeds with a photo → `published/publishedAt` set; unpublish clears it.
- Public `listPublic` returns only published+vacant+approved; hides an unpublished or OCCUPIED unit; filters by estate + type; card DTO carries only `visibleFields` and no bytes.
- Public `getPhotoBytes` 404s for an unpublished unit's photo; 200 for a published one; staff image route serves a draft.
- Role checks: viewer can GET staff payload but not PATCH/POST/DELETE (403); anonymous can hit public routes.

Client:
- `UnitListingView` renders the photo grid + details editor from a mocked `unitListings.get`; uploading calls `addPhoto`; set-cover calls `setCover`; toggling a visible field + Save calls `update`; Publish calls `publish`; the publish button is disabled/tooltipped when there are 0 photos.
- `resource.js` `unitListings` methods hit the right URLs.

## Rollout

Additive tables via idempotent SQL (dev + test now; per-environment on deploy, per [[prisma-migration-drift]]). Regenerate the Prisma client; rebuild client + restart server.

## Affected files

- `shared/unitListingFields.js` (new)
- `server/prisma/schema.prisma` + `server/prisma/manual-migrations/2026-09-01-unit-listings.sql`
- `server/src/services/unitListingService.js`, `controllers/unitListingController.js`, `routes/unitListingRoutes.js`, `routes/publicUnitRoutes.js`, `validation/unitListing.js` (new); `server/src/app.js` (mount)
- `client/src/views/UnitListingView.vue` (new); `client/src/lib/resource.js`; `client/src/router/index.js`; `client/src/views/UnitsView.vue` / `UnitFormView.vue` (entry link)
- Server + client tests
