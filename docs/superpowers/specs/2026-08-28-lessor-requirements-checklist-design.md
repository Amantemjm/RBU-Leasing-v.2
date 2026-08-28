# Lessor Requirements Checklist — Design Spec

**Date:** 2026-08-28
**Status:** Approved (design), pending implementation plan
**Sub-project:** F of the "Enhanced Lessor Process" program.
**Area:** Requirements (Prisma model/migration + server + client). Lessor-scoped.

## Problem

The only requirements feature today is a flat, tenant-only file list (`Requirement`: tenant, filename, bytes). There is no checklist of the documents a **lessor** must submit, no per-document status, and no staff review or visibility of what's outstanding.

## Goal

A profile-level **requirements checklist** for the lessor: a canonical list of required document types, each with an uploaded file and a status the lessor and O-Lease can track — Required → Submitted → reviewed (Approved / Rejected / For Resubmission / Expired).

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Scope | **Lessor only.** The existing tenant `Requirement` upload is untouched. |
| Checklist source | **Fixed shared config** (canonical list), not admin-configurable. |
| Statuses | `Required, Submitted, Under Review, Approved, Rejected, Expired, For Resubmission`. |
| Expired | **Manual** — staff set it; an optional `expiresAt` is stored for reference (no auto-expiry). |
| Storage | File bytes in the DB column (same as the existing `Requirement` and transaction documents). |

## Non-goals

- Unifying lessee/tenant requirements (kept separate).
- Admin-configurable requirement types (a later enhancement).
- Auto-expiry by date, per-unit requirements (this is profile-level), the centralized Lessor Profile view (sub-project D consumes this).

## Architecture

### 1. Shared config (`shared/lessorRequirements.js`)

```js
export const LESSOR_REQUIREMENT_TYPES = [
  { key: "GOV_ID",        label: "Valid Government ID" },
  { key: "OWNERSHIP",     label: "Proof of Ownership (Title / CCT)" },
  { key: "TAX_DEC",       label: "Tax Declaration" },
  { key: "RPT_RECEIPT",   label: "Latest Real Property Tax Receipt" },
  { key: "AUTH_LETTER",   label: "Authorization Letter / SPA" },
  { key: "ASSOC_CLEARANCE", label: "Association / Dues Clearance" },
  { key: "BANK_DETAILS",  label: "Bank Account Details" },
];
export const REQUIREMENT_STATUSES = [
  "Required", "Submitted", "Under Review", "Approved", "Rejected", "Expired", "For Resubmission",
];
export const REQUIREMENT_KEYS = LESSOR_REQUIREMENT_TYPES.map((r) => r.key);
```

### 2. Data model (`server/prisma/schema.prisma` + migration)

New model, one row per `(unitOwner, requirementKey)`:
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
Add the back-relation `lessorRequirements LessorRequirement[]` to `model UnitOwner`. One additive migration; nothing to backfill.

### 3. Server

**Service `lessorRequirementService.js`**
- `listForOwner(unitOwnerId)` — reads rows for the owner and returns the **full checklist**: for each config type, the row if present (metadata only — never the `data` bytes), else a synthesized `{ requirementKey, label, status: "Required" }`. Always returns all 7 items in config order.
- `uploadRequirement(user, unitOwnerId, key, file)` — validates `key ∈ REQUIREMENT_KEYS`; **upserts** the `(owner, key)` row with the file, `status: "Submitted"`, `submittedAt: now`, and clears the prior `remarks`. A `UNIT_OWNER` may upload only for their own `unitOwnerId` (else 404); staff may upload for any owner ("encode existing").
- `reviewRequirement(user, id, { status, remarks, expiresAt })` — staff only; validates `status ∈ REQUIREMENT_STATUSES`; sets status/remarks/expiresAt + `reviewedById/Name/At`.
- `getForDownload(user, id)` — returns the row incl. `data`, scoped (owner: their own; staff: any); 404 otherwise.

**Routes `/api/lessor-requirements`** (all `verifyJwt`), multer memory upload with the existing allow-list (PDF/JPEG/PNG/DOCX, ≤10 MB):
- `GET /mine` — `UNIT_OWNER` → their checklist (uses `req.user.unitOwnerId`).
- `GET /:unitOwnerId` — `ADMIN`/`LEASING_OFFICER` → that lessor's checklist.
- `POST /mine/:key` — `UNIT_OWNER`, `upload.single("file")` → upload own.
- `POST /:unitOwnerId/:key` — `ADMIN`/`LEASING_OFFICER`, file → upload on behalf.
- `PATCH /:id/review` — `ADMIN`/`LEASING_OFFICER` → `{ status, remarks?, expiresAt? }`.
- `GET /:id/download` — owner (own) or staff.

Mounted in `server/src/app.js` under `/api/lessor-requirements`. Reviews are captured by the existing audit middleware.

**Validation (`validation/lessorRequirement.js`)**: `reviewSchema = z.object({ status: z.enum(REQUIREMENT_STATUSES), remarks: z.string().optional().nullable(), expiresAt: z.string().datetime().optional().nullable() })`.

### 4. Client

- **Lessor "My Requirements"** — new nav item for `UNIT_OWNER` (`/app/lessor-requirements`, `MyLessorRequirementsView.vue`): renders the checklist; each item shows a status badge, the staff remark (if any), a **download** link when a file exists, and an **Upload / Replace** control when the item is actionable (`Required`, `Rejected`, `For Resubmission`, `Expired`). Uploading posts to `/mine/:key` and refreshes.
- **Staff "Lessor Requirements"** — new nav item for write-staff (`/app/lessor-sheets` sits near here; add `/app/lessor-requirements`, `LessorRequirementsView.vue`): a searchable lessor (owner) picker → the checklist with, per item: status badge, download, an **Upload-on-behalf** control, and a **Review** control (set status + optional remark + optional expiry date) posting to `/:id/review`.
- **`resource.js`**: `lessorRequirements` wrapper — `mine()`, `forOwner(id)`, `uploadMine(key, file)`, `uploadFor(ownerId, key, file)`, `review(id, body)`, and a `downloadUrl(id)` helper (multipart uploads use `FormData`).
- Router entries + `AppLayout` nav: add "Requirements" under the Owner group and "Lessor Requirements" under the staff Workspace group (write-staff).

## Data flow

```
Lessor: My Requirements → Upload(key) → Submitted
Staff: Lessor Requirements → review(id, Approved/Rejected/For Resubmission/Expired + remark)
Lessor: sees status + remark → re-upload on Rejected/For Resubmission/Expired → Submitted
Staff: Upload-on-behalf(ownerId,key) → Submitted (then review → Approved) = "encode existing"
```

## Error handling

- Upload/download/review by a non-owner on someone else's requirement → 404.
- Unknown `requirementKey` → 400. Invalid `status` → 400 (Zod). Missing file on upload → 400.
- Review on a missing row → 404.

## Testing (Vitest / Supertest)

Server:
- `listForOwner` returns all 7 items; missing ones are `Required`; never ships `data`.
- Owner upload sets `Submitted` + `submittedAt`, own-only (404 for another owner's key).
- Staff upload-on-behalf works for any owner.
- Staff review sets status/remarks/expiresAt + reviewer; invalid status → 400.
- Download scoping (owner own = 200, other owner = 404, staff = 200).

Client:
- Lessor view renders 7 items with badges; actionable items show Upload; upload calls `uploadMine`.
- Staff view lists a lessor's checklist; Review calls `review(id, …)`; Upload-on-behalf calls `uploadFor`.

## Rollout

One additive Prisma migration (new table). `prisma migrate deploy` per environment, then rebuild client + restart server.

## Affected files

- `shared/lessorRequirements.js` (new)
- `server/prisma/schema.prisma` + migration; `server/src/services/lessorRequirementService.js`, `controllers/lessorRequirementController.js`, `routes/lessorRequirementRoutes.js`, `validation/lessorRequirement.js` (new); `server/src/app.js` (mount)
- `client/src/views/MyLessorRequirementsView.vue`, `LessorRequirementsView.vue` (new); `client/src/lib/resource.js`; `client/src/router/index.js`; `client/src/components/AppLayout.vue`
- Server + client tests
