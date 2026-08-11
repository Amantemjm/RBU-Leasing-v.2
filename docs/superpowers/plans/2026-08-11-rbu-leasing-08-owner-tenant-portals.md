# RBU Leasing — Plan 8: Unit Owner & Tenant Portals (role access)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Small TDD steps: failing test → minimal code → passing test → commit.

**Goal:** Add self-service roles. **Unit Owners** log in to see their own units (+ read-only leases/payments) and submit new units for lease that O-Lease (Admin/Officer) approves. **Tenants** log in to upload requirement documents stored in the DB and visible to Admin/Officer. Admin provisions and links these accounts.

**Architecture:** New roles `UNIT_OWNER`/`TENANT` on `User`, each linked via `unitOwnerId`/`tenantId` FKs. JWT carries the link so services scope data to it. Unit gains an `approvalStatus`. Uploaded files are stored as Postgres `Bytes` in a new `Requirement` model. Follows the existing layered pattern (routes→controllers→services→prisma; Zod validation; requireRole).

**Tech Stack:** Prisma 6, Express 5, Zod, multer (file upload), Vitest+Supertest, Vue 3.

## Global Constraints
- Roles: `ADMIN | LEASING_OFFICER | VIEWER | UNIT_OWNER | TENANT`. Admin provisions owner/tenant accounts (no public signup).
- Owner scope: an owner only ever sees rows for their linked `UnitOwner`. Tenant scope: only their own `Requirement`s.
- Owner-submitted units start `PENDING`; Admin/Officer approve/reject. Admin/Officer-created units default `APPROVED`.
- Files stored in Postgres (`Bytes`), max 10 MB, types pdf/jpg/png/docx. Data column never returned in list responses (only via download).
- All CRUD tables + new tables reset in tests via `resetCrudTables`; extend it. Prisma pinned v6, ESM. Commit after each green step. Work on Dev (`master`) only.

---

## Phase A — Data model & auth foundation

### Task A1: Schema — roles, links, approvalStatus, Requirement
- Modify `server/prisma/schema.prisma`: add `UNIT_OWNER`, `TENANT` to `Role`; add enum `UnitApprovalStatus { PENDING APPROVED REJECTED }`; on `User` add `unitOwner UnitOwner? @relation(...)`/`unitOwnerId String?` and `tenant Tenant? @relation(...)`/`tenantId String?`; on `UnitOwner` add `users User[]`, on `Tenant` add `users User[]` and `requirements Requirement[]`; on `Unit` add `approvalStatus UnitApprovalStatus @default(APPROVED)`; add model `Requirement { id, tenant Tenant @relation(fields:[tenantId],references:[id]), tenantId, filename String, mimeType String, size Int, data Bytes, uploadedAt DateTime @default(now()) }`.
- `npx prisma migrate dev --name owner_tenant_portals`; regenerate; run `npm --workspace server test` (expect green — additive). Commit.
- Extend `resetCrudTables` (delete `requirement` before `tenant`; `user` rows that reference owner/tenant are seeded admin only — do NOT delete users). Add `factory.requirement`.

### Task A2: Auth carries the owner/tenant link
- Test (`authService.test.js` add): `issueToken({ id, role, unitOwnerId, tenantId })` encodes all four; `loginUser` returns `{ token, user }` with `user.unitOwnerId`/`user.tenantId`.
- Implement: `issueToken` signs `{ userId, role, unitOwnerId: unitOwnerId ?? null, tenantId: tenantId ?? null }`; `verifyJwt` sets `req.user = { userId, role, unitOwnerId, tenantId }`; `loginUser` selects + returns those fields and passes them to `issueToken`.

### Task A3: Admin provisions owner/tenant accounts
- `registerUser({ name, email, password, role, unitOwnerId, tenantId })`: if role `UNIT_OWNER` require+assert `unitOwnerId` exists; if `TENANT` require+assert `tenantId`; else ignore links. Returns user (no hash).
- Validation `server/src/validation/user.js`: `registerSchema` with role enum incl new roles + optional link ids.
- Route stays `POST /api/auth/register` (ADMIN-only). Supertest: admin creates a UNIT_OWNER linked to an owner (201); creating UNIT_OWNER without a valid owner → 400; VIEWER cannot register (403, existing).

---

## Phase B — Owner portal (backend)

### Task B1: Owner-scoped units + approval
- `unitService.listUnits` gains `approvalStatus` filter; new `listUnitsForUser(user, filters)` that, when `user.role==="UNIT_OWNER"`, forces `ownerId = user.unitOwnerId` (ignores foreign ownerId) and returns all statuses.
- `createUnitForUser(user, data)`: OWNER → force `ownerId = user.unitOwnerId`, `approvalStatus="PENDING"`; Admin/Officer → as given, default APPROVED.
- `approveUnit(id, decision)` → sets APPROVED/REJECTED.
- Routes: `GET /api/units` allowed for all roles (controller scopes by role); `POST /api/units` allowed for ADMIN/OFFICER/UNIT_OWNER (controller branches); `PATCH /api/units/:id/approve` + `/reject` (ADMIN/OFFICER only).
- Tests: owner sees only own units incl PENDING; owner-created unit is PENDING + owned by them even if they pass another ownerId; officer approve flips to APPROVED; owner cannot approve (403).

### Task B2: Owner read-only leases/payments
- `leaseService.listLeasesForUser(user, filters)` and `paymentService.listPaymentsForUser`: OWNER → scope to leases on units of `user.unitOwnerId` (payments via those leases). OWNER blocked from writes (requireWrite already excludes them).
- Controllers use the scoped list for GET. Tests: owner sees only leases/payments on their units; a different owner sees none.

---

## Phase C — Tenant requirements (backend)

### Task C1: Requirement upload/list/download
- `npm --workspace server install multer`. `requirementService.js`: `createRequirement({tenantId,filename,mimeType,size,data})`, `listRequirements({tenantId})` (omit `data`), `getRequirement(id)` (with data), plus scoping helpers.
- Routes `server/src/routes/requirementRoutes.js` mounted `/api/requirements`, `verifyJwt`:
  - `POST /` multer `.single("file")`, roles TENANT (own) — save with `tenantId=req.user.tenantId`, validate size/type.
  - `GET /` — TENANT → own; ADMIN/OFFICER → all or `?tenantId=`.
  - `GET /:id/download` — TENANT own or ADMIN/OFFICER → streams bytes with content-disposition.
- Tests (Supertest, attach a small buffer): tenant uploads (201) → appears in their list (no `data` field) → downloads (200, correct bytes); admin lists all + downloads; a tenant cannot see another tenant's requirement (404/empty).

---

## Phase D — Frontend

### Task D1: Role-aware nav + routing + auth store
- Auth store already holds `user`; getters `role`, plus `unitOwnerId`/`tenantId`. Router guard by role: OWNER→ /my-units,/register-unit; TENANT→ /requirements; staff→ full app + /approvals + /requirements. Nav links filtered by role.

### Task D2: Owner views — My Units + Register Unit
- `lib/resource.js`: reuse `units`; add `unitsApprove(id, decision)`.
- `MyUnitsView.vue`: lists owner's units grouped by tower with approval-status badge.
- `RegisterUnitView.vue`: cascading Estate→Tower + unit fields; submits (creates PENDING); shows "submitted for approval".

### Task D3: Admin approvals
- `ApprovalsView.vue`: lists `?approvalStatus=PENDING` units with Approve/Reject buttons (calls approve/reject).

### Task D4: Tenant requirements + admin view
- `lib/requirements.js`: `upload(file)`, `list(params)`, `downloadUrl(id)`/download-as-blob.
- `RequirementsView.vue`: TENANT → file input + upload + own list; staff → all uploads grouped by tenant + download.

### Task D5: Admin user provisioning
- `UsersView.vue` (ADMIN): create a login — name/email/password, role select (incl UNIT_OWNER/TENANT), and a linked UnitOwner/Tenant picker shown when that role is chosen. POSTs `/api/auth/register`.

### Task D6: Build + verify
- `npm --workspace client run build`; browser walkthrough per role.

---

## Self-Review
**Coverage:** roles + provisioning (A1–A3), owner units+approval+register (B1, D2, D3), owner read-only leases/payments (B2), tenant upload-to-DB + admin-visible (C1, D4), admin provisioning UI (D5), role-scoped nav (D1). **Placeholders:** phase tasks name exact files/behaviors; per-task code written at execution time in TDD steps. **Types:** JWT claims `{userId,role,unitOwnerId,tenantId}` consistent across issueToken/verifyJwt/loginUser and all `*ForUser` service fns; `approvalStatus` enum used in schema/validation/UI; `Requirement` fields consistent across service/routes/UI.

## Later
- Owner/tenant self-registration, requirement review/approval states, email notifications, moving file storage to object storage if volume grows.
