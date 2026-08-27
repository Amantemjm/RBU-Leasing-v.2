# Unit Registration Lifecycle — Design Spec

**Date:** 2026-08-27
**Status:** Approved (design), pending implementation plan
**Sub-project:** E of the "Enhanced Lessor Process" program.
**Area:** Unit registration + approval (Prisma schema/migration + server + client)

## Problem

A unit today has a flat 3-value `approvalStatus` (`PENDING/APPROVED/REJECTED`, default
`APPROVED`) with no rejection reason. Lessor submissions go straight to `PENDING`; there is
no draft step, no self-service correction after a rejection, and staff cannot tell the lessor
what to fix.

## Goal

Give units a real lifecycle — **Draft → Submitted → Approved / Rejected** — with a
staff-provided rejection remark, and let the lessor draft, edit, and re-submit their own
units.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| States | **4:** `DRAFT → SUBMITTED → APPROVED / REJECTED` (Submitted = the review queue; no separate "Pending Approval"). |
| Lessor actions | Draft + edit + resubmit: save as draft or submit; edit a `DRAFT`/`REJECTED` unit and (re)submit; locked once `SUBMITTED`/`APPROVED`. |
| Reject remark | **Required** — staff must give a reason on rejection; the lessor sees it. |
| Default | Column default stays `APPROVED` (existing + admin-created units unaffected). |

## Non-goals

- Requirements/documents on the unit (sub-project F), the centralized lessor profile (D),
  and everything else in later sub-projects. This spec is the unit status machine only.

## Architecture

### 1. Data model (`server/prisma/schema.prisma` + migration)

- `enum UnitApprovalStatus` becomes **`{ DRAFT, SUBMITTED, APPROVED, REJECTED }`** — `PENDING`
  is retired.
- `Unit.approvalStatus` keeps `@default(APPROVED)`.
- Add `Unit.reviewRemarks String?` — the staff rejection reason (also usable as an approval
  note); cleared when the unit is re-submitted or approved.

**Migration** (one file):
1. Add enum values `DRAFT`, `SUBMITTED`.
2. `UPDATE "Unit" SET "approvalStatus" = 'SUBMITTED' WHERE "approvalStatus" = 'PENDING';`
3. Add the `reviewRemarks` column.
4. Remove `PENDING` from the enum (Prisma regenerates the type; safe because step 2 leaves no
   rows using it). If a clean enum recreation is impractical in one migration, leaving
   `PENDING` as an unused value is acceptable — the code never writes it.

The dev DB currently has **0 units**, so there is no real data to convert there.

### 2. Server

**`server/src/services/unitService.js`**
- `createUnitForUser(user, data)` — for a `UNIT_OWNER`, set `approvalStatus` to `SUBMITTED`
  when `data.submit === true`, else `DRAFT`. (Admin/officer create is unchanged → default
  `APPROVED`.)
- `updateUnit(user, id, data)` — when the caller is a `UNIT_OWNER`: assert the unit belongs to
  them **and** its status is `DRAFT` or `REJECTED`, else `409/403`. Staff keep full update.
- `submitUnit(user, id)` — `DRAFT`/`REJECTED` → `SUBMITTED`, clears `reviewRemarks`;
  owner-scoped to their own unit (staff may also call it).
- `approveUnit(id)` — → `APPROVED`, clears `reviewRemarks`.
- `rejectUnit(id, remarks)` — → `REJECTED`, stores `reviewRemarks = remarks` (remarks
  required).

**`server/src/routes/unitRoutes.js` + `unitController.js`**
- `POST /units` — already allows `UNIT_OWNER`; honor the `submit` flag.
- `PATCH /units/:id` — allow `UNIT_OWNER` in addition to write-staff; the service enforces the
  owner's ownership + `DRAFT`/`REJECTED` guard.
- `PATCH /units/:id/submit` — `UNIT_OWNER` (own unit) or write-staff.
- `PATCH /units/:id/approve` — write-staff (unchanged).
- `PATCH /units/:id/reject` — write-staff; body `{ remarks }` (required).

**`server/src/validation/unit.js`**
- `unitCreateSchema` gains optional `submit: z.boolean().optional()`.
- New `unitRejectSchema = z.object({ remarks: z.string().min(1) })`.

### 3. Client

- **`RegisterUnitView.vue`** — two buttons: **Save as Draft** (`submit:false`) and **Submit
  for approval** (`submit:true`).
- **`MyUnitsView.vue`** — show the status badge; for `DRAFT`/`REJECTED` units show **Edit**
  and **Submit** actions; when `REJECTED`, show the `reviewRemarks`. (Editing reuses the
  register form pre-filled, or an inline edit — implementer's choice following existing
  patterns.)
- **`ApprovalsView.vue`** — the pending queue now lists **`SUBMITTED`** units; **Reject** opens
  a small remark prompt (mirroring the Account-Approvals reject modal) and sends `{ remarks }`.
- **`resource.js`** — `units` wrapper gains `submit(id)`, `reject(id, remarks)`, and an owner
  `update(id, data)` call; `approve(id)` unchanged.

## Data flow

```
Owner: Register → Save as Draft (DRAFT)  ──edit──▶ Submit ──▶ SUBMITTED
Owner: Register → Submit (SUBMITTED)
Staff: Approvals lists SUBMITTED → Approve → APPROVED
                                 → Reject(remarks) → REJECTED (+reviewRemarks)
Owner: sees remarks on REJECTED → edit → Submit → SUBMITTED (remarks cleared)
```

## Error handling

- Owner editing/submitting a unit that is not theirs → `404` (not disclosed).
- Owner editing/submitting a unit in `SUBMITTED`/`APPROVED` → `409` ("this unit can no longer
  be edited").
- Reject without `remarks` → `400` (Zod).
- Approve/reject/submit on a missing unit → `404`.

## Testing (Vitest / Supertest)

Server:
- Owner create with `submit:false` → `DRAFT`; with `submit:true` → `SUBMITTED`; admin create →
  `APPROVED`.
- Owner edit allowed in `DRAFT`/`REJECTED`; `409` in `SUBMITTED`/`APPROVED`; `404` for another
  owner's unit.
- `submit` moves `DRAFT`/`REJECTED` → `SUBMITTED` and clears `reviewRemarks`.
- `approve` → `APPROVED` (clears remarks); `reject` requires `remarks`, sets `REJECTED` +
  `reviewRemarks`.
- Approvals list returns `SUBMITTED` units.

Client:
- Register view posts `submit` correctly for each button.
- My Units shows edit/submit for draft/rejected and renders remarks on rejected.
- Approvals reject flow sends remarks.

## Rollout

- One Prisma migration (enum + column + data update). Run `prisma migrate deploy` per
  environment, then rebuild client + restart server.

## Affected files

- `server/prisma/schema.prisma`, new migration
- `server/src/services/unitService.js`, `controllers/unitController.js`, `routes/unitRoutes.js`,
  `validation/unit.js`
- `client/src/views/RegisterUnitView.vue`, `MyUnitsView.vue`, `ApprovalsView.vue`,
  `client/src/lib/resource.js`
- Server + client tests
