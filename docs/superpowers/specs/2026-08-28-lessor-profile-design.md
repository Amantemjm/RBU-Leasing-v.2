# Centralized Lessor Profile — Design Spec

**Date:** 2026-08-28
**Status:** Approved (design), pending implementation plan
**Sub-project:** D of the "Enhanced Lessor Process" program.
**Area:** Read-only aggregation (server endpoint + client staff view). No schema change.

## Problem

A lessor's information is scattered across separate screens — Owners, Units, Lessor Requirements, Lessor Sheets. O-Lease has no single place to see a lessor's whole picture.

## Goal

A staff-facing **Lessor Profile** page that consolidates one lessor's details, contacts, units, requirements checklist, acceptance-form status, and recent activity — served by one aggregate endpoint over existing data.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Audience | **Staff only** (ADMIN/LEASING_OFFICER). The lessor's own nav already exposes the pieces. |
| Delivery | **One aggregate endpoint** `GET /api/owners/:id/profile`; the view renders it. |
| Data | **Read-only aggregation** — no schema change. Edits stay in existing flows; the profile links to them. |
| Activity | **Lightweight derived feed** from record timestamps (unit status, requirement reviews, form submission/review), not the raw AuditLog. |

## Non-goals

- Editing owner/unit/requirement data from this page (link out to existing flows).
- A lessor-facing consolidated profile (staff-only for D).
- A full AuditLog activity trail.

## Architecture

### 1. Server

**New service `server/src/services/lessorProfileService.js`**
```
getLessorProfile(ownerId) -> {
  owner:  { id, name, email, phone, address, assignedOfficer:{id,name}|null },
  account:{ contactEmail, status } | null,   // from the linked portal User, if any
  units:  [{ id, unitNumber, tower, approvalStatus, reviewRemarks, updatedAt }],
  requirements: { items: <F checklist for the owner>, summary: { approved, total } },
  acceptanceForm: { status, submittedAt, reviewedAt } | null,   // latest LessorInfoSheet
  activity: [{ at, kind, label }]  // merged, newest-first, top 10
}
```
- Loads the owner with `assignedOfficer`, `users` (for `contactEmail` + account `status`), `units`, `lessorInfoSheets`; 404 if not found.
- Reuses `lessorRequirementService.listForOwner(ownerId)` for the checklist; `summary.approved` = count of items with status `Approved`, `total` = 7.
- `acceptanceForm` = the most recent `LessorInfoSheet` (by `createdAt`), status/submittedAt/reviewedAt.
- `activity` = merge of: each unit → `{ at: unit.updatedAt, kind:"unit", label:"Unit <n> — <status>" }`; each requirement row that has a `reviewedAt` → `{ at: reviewedAt, kind:"requirement", label:"<Requirement label> — <status>" }`; the info sheet's `submittedAt`/`reviewedAt` if present. Sort by `at` desc, take 10.
- Never returns binary blobs (unit/requirement/info-sheet file bytes).

**Controller/route (existing owners router)**
- `ownerController.profile(req,res,next)` → `res.json(await getLessorProfile(req.params.id))`.
- `server/src/routes/ownerRoutes.js`: `router.get("/:id/profile", requireStaff, ctrl.profile);` (placed after `/me`, before or after `/:id` — distinct segment count, no collision).

### 2. Client

**New view `client/src/views/LessorProfileView.vue`** at `/app/lessor-profile/:id` (write-staff, `meta.roles = WRITE`):
- **Header**: name, email/phone/address, assigned officer, account status badge.
- **Units** section: table of units with status badges (reuse the E badge styles); each row links to the unit's admin page / approvals.
- **Requirements** section: the F checklist — a "X of 7 approved" summary line + each item's label + status badge + remark; links to the staff "Lessor Requirements" review view for actions.
- **Acceptance Form** section: status + submitted/reviewed dates; link to Lessor Sheets.
- **Recent activity**: the `activity` list (label + relative/short date).
- Loads via `owners.profile(id)`.

**Entry point**: in `client/src/views/OwnersView.vue`, add a **"Profile"** link per row → `router.push('/app/lessor-profile/' + row.id)`.

**`resource.js`**: add `owners.profile = (id) => api.get('/owners/' + id + '/profile')` — since `owners` is built by the generic `resource()` factory, add a standalone `export function ownerProfile(id)` (or extend the object) that GETs `/owners/:id/profile`.

**Router**: import `LessorProfileView`, add the child route under `/app`.

## Data flow

```
Staff: Owners list → click Profile → GET /api/owners/:id/profile
  -> render header + units + requirements(summary) + acceptance form + activity
  -> links out to Units/Approvals, Lessor Requirements, Lessor Sheets for edits
```

## Error handling

- Unknown owner id → 404.
- Non-staff caller → 403 (route guard).
- Missing pieces (no units / no requirements rows / no info sheet) render as empty sections or "Required"/"—", never error.

## Testing (Vitest / Supertest)

Server:
- `GET /owners/:id/profile` returns owner + units + requirements checklist (7 items) + summary + acceptanceForm + activity; staff 200, owner/tenant 403; unknown id 404; `summary.approved` counts Approved items; no binary blobs in the payload.
- Activity is sorted newest-first and capped at 10.

Client:
- `LessorProfileView` renders each section from a mocked `owners.profile` (header, a unit row, a requirement item + summary, form status, an activity entry).
- `OwnersView` renders a Profile link that routes to `/app/lessor-profile/:id`.

## Affected files

- `server/src/services/lessorProfileService.js` (new); `server/src/controllers/ownerController.js`, `server/src/routes/ownerRoutes.js` (add profile)
- `client/src/views/LessorProfileView.vue` (new); `client/src/views/OwnersView.vue`, `client/src/lib/resource.js`, `client/src/router/index.js`
- Server + client tests
