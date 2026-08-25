# Enhanced Account Creation — Design Spec

**Date:** 2026-08-25
**Status:** Approved (design), pending implementation plan
**Area:** Auth / onboarding (client + server + DB)

## Problem

Today anyone can self-register as a lessor (`UNIT_OWNER`) or lessee (`TENANT`) at
`/signup` with no vetting, and the form captures only name, username, and password. The
account is active immediately. Separately, the system stores each user's password in
plaintext (`User.passwordPlain`) to power an admin "reveal password" feature — a known
security risk.

## Goals

1. **Vetting** — new lessor/lessee self-signups start **PENDING** and cannot act until a
   staff member approves them.
2. **Richer profile** — capture a contact **email** and **mobile** at signup, stored on the
   linked owner/tenant record.
3. **Validation & security** — stronger password rules, confirm-password, email-format
   validation, and **removal of plaintext password storage** in favor of an admin
   reset-password flow.
4. **UX** — a clear "awaiting approval / not approved" experience for pending/rejected users
   and a staff **Account Approvals** screen.

## Non-goals (YAGNI)

- Email notifications (no email connector exists in the system).
- Address / company fields at signup.
- Self-service password reset by end users (only admin-initiated reset).
- Account suspension/reactivation lifecycle beyond PENDING/APPROVED/REJECTED.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Vetting model | Self-signup **+ admin/officer approval**; new accounts start PENDING |
| Pending behavior | User **can log in**, sees a limited "awaiting approval" gate; no portal actions |
| Approver & location | **ADMIN + LEASING_OFFICER**, dedicated **Account Approvals** screen |
| Signup fields added | **Mobile (required)** + **contact email (validated)** → owner/tenant record |
| Password security | **Remove plaintext**; add admin **reset password** |
| Password rules | **≥8 chars, ≥1 letter and ≥1 number**, plus confirm-password |
| Rejection | Mark **REJECTED + optional reason**; user sees "not approved" on login |
| Gate enforcement | **Approach A** — DB status-check middleware (authoritative, instant on approval) |

## Architecture

### 1. Data model (Prisma)

- New enum: `AccountStatus { PENDING, APPROVED, REJECTED }`.
- `User` gains:
  - `accountStatus AccountStatus @default(APPROVED)` — column default APPROVED so existing
    rows and admin-created accounts are active; self-signup sets `PENDING` explicitly.
  - `rejectionReason String?`
- `User.passwordPlain` is **dropped**.
- No new columns on `UnitOwner` / `Tenant`: signup **mobile → `phone`**, **email → `email`**
  (both already exist).
- Migration backfills existing users to `APPROVED` (via the column default on add) and the
  seed no longer writes `passwordPlain`. The seeded super admin remains `APPROVED`.

> Context: recent migrations `20260825010000_drop_password_plain` and
> `20260825020000_readd_password_plain` toggled this column. This spec drops it permanently.

### 2. Signup — client + server

**Client (`SignupView.vue`)** adds: contact **email**, **mobile**, **confirm password**,
with inline validation and a password-strength hint. Submit is disabled until valid.

**Field/column mapping (important):** `User.email` is the **login identifier** (may be a
plain username, min 3) and is unchanged. The new **contact email** is a separate field that
lives on the linked `UnitOwner`/`Tenant` record, not on `User`.

**Server (`validation/user.js` `signupSchema`)** — payload keys:
```
name:            string, min 1        → User.name / owner|tenant.name (full name)
username:        string, min 3        → User.email  (login identifier; existing column)
contactEmail:    string, email format → owner|tenant.email   (NEW, required)
mobile:          string, min 7        → owner|tenant.phone    (NEW, required)
password:        string, regex ≥8 with ≥1 letter and ≥1 digit
role:            enum { UNIT_OWNER, TENANT }
```
`confirmPassword` is validated client-side only and not sent.

**`signupPortalUser`** creates the linked record with `{ name, email: contactEmail, phone:
mobile }` and the user with `{ email: username, accountStatus: PENDING, passwordHash }`. It
still returns a session token (auto-signed-in), but the client routes the user to the gate.
Admin `/register` accounts are `APPROVED`. (This replaces the current behavior where the
owner/tenant email was derived from the username via `email.includes("@")`.)

### 3. Gate enforcement — server middleware (Approach A)

New `requireApproved` middleware:
- Loads the caller's `accountStatus` by `req.user.userId`.
- If role ∈ {`UNIT_OWNER`, `TENANT`} and status ≠ `APPROVED` → **403** with a stable error
  code (e.g. `ACCOUNT_NOT_APPROVED`).
- Staff roles bypass.

Applied to portal mutations:
- `POST /api/units` (owner unit registration)
- `POST/PATCH` on `/api/leasing-transactions` portal actions + `POST /:id/documents`
- `PATCH /api/lessor-info-sheets/:id/submit` and `/:id/submit-pdf` (and `/pdf` save)
- `PATCH /api/lessee-info-sheets/:id/submit` and `/:id/submit-pdf` (and `/pdf` save)
- `POST /api/requirements`

Read-only GETs remain open so the gate screen and empty portal render.

### 4. Account Approvals — staff API + screen

Endpoints (guarded `requireRole("ADMIN", "LEASING_OFFICER")`):
- `GET  /api/auth/accounts?status=PENDING` — list `{ id, name, username, role, contact
  email/phone, linked record name, accountStatus, createdAt }`.
- `PATCH /api/auth/accounts/:id/approve` → sets `APPROVED`, clears `rejectionReason`.
- `PATCH /api/auth/accounts/:id/reject` `{ reason? }` → sets `REJECTED`, stores reason.

New client screen **`AccountApprovalsView.vue`** at `/app/account-approvals` (nav entry for
write-staff), modeled on the existing unit `ApprovalsView`: pending table + Approve / Reject
(reason prompt). Approve/reject are recorded by the existing `auditMiddleware`.

### 5. Pending / Rejected experience — client

- `stores/auth.js` carries `accountStatus`.
- Router guard: a `UNIT_OWNER`/`TENANT` whose status ≠ `APPROVED` is redirected to
  `/app/pending`.
- **`PendingView.vue`**:
  - PENDING → "Your account is awaiting approval."
  - REJECTED → "Your account was not approved." + reason.
  - **Check status** button calls `GET /api/auth/me` (now returns `accountStatus`); when it
    flips to APPROVED the guard releases the user into their portal — no re-login.

### 6. Password security changes

- Remove all `passwordPlain` reads/writes: `signupPortalUser`, `registerUser`, `updateUser`,
  `listUsers` (drops the returned `password` field), and the seed.
- **`UsersView.vue`**: remove the password-reveal column; add an admin **Reset password**
  action that calls the existing `PATCH /api/auth/users/:id` with a new password.

## Data flow

```
Lessor/Lessee signup → POST /auth/signup
  → create UnitOwner/Tenant { name, email, phone }
  → create User { role, accountStatus: PENDING, hash only }
  → return token (auto-login) → client guard → /app/pending

Staff → Account Approvals → PATCH /auth/accounts/:id/approve
  → User.accountStatus = APPROVED (audited)

User → PendingView "Check status" → GET /auth/me → APPROVED
  → guard releases → portal (My Units / Register Unit, etc.)

Any portal mutation while PENDING/REJECTED → requireApproved → 403 ACCOUNT_NOT_APPROVED
```

## Error handling

- Signup validation errors return field-level messages (Zod), surfaced inline on the form.
- Duplicate username/email → 409 (existing behavior retained).
- Portal mutation while not approved → 403 `ACCOUNT_NOT_APPROVED`; client interprets and
  redirects to the gate.
- Approve/reject on a non-existent or non-portal account → 404.

## Testing (Vitest / Supertest)

Server:
- Signup sets `accountStatus: PENDING` and creates owner/tenant carrying contact email +
  phone.
- Validation rejects weak password (`<8`, no letter, or no digit), bad contact email, and
  duplicate username.
- `requireApproved` blocks a PENDING user's `POST /units` (403) and allows it after approval.
- `approve`/`reject` enforce ADMIN+LEASING_OFFICER; reject stores the reason.
- `login` and `GET /auth/me` return `accountStatus`.
- `listUsers` no longer includes any password field.
- Admin reset-password updates the hash and lets the user log in with the new password.

## Migration & rollout notes

- Single Prisma migration: create enum, add `accountStatus` (default APPROVED) +
  `rejectionReason`, drop `passwordPlain`.
- Existing users remain able to log in and act (backfilled APPROVED).
- Update `prisma/seed.js` to remove `passwordPlain`.
- After merge, run `prisma migrate deploy` on each environment (Dev/QA/Prod).

## Affected files (approximate)

- `server/prisma/schema.prisma`, new migration, `server/prisma/seed.js`
- `server/src/validation/user.js`
- `server/src/services/authService.js`
- `server/src/controllers/authController.js`, `server/src/routes/authRoutes.js`
- `server/src/middleware/auth.js` (new `requireApproved`)
- Apply middleware in `unitRoutes.js`, `leasingTransactionRoutes.js`,
  `lessorInfoSheetRoutes.js`, `lesseeInfoSheetRoutes.js`, `requirementRoutes.js`
- `client/src/views/SignupView.vue`, new `PendingView.vue`, new `AccountApprovalsView.vue`,
  `client/src/views/UsersView.vue`
- `client/src/router/index.js`, `client/src/stores/auth.js`, relevant `client/src/lib/*`
- Server + client tests
