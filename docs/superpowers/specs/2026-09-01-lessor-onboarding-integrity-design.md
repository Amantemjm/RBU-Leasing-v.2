# Lessor Onboarding Integrity (#3 + #4) — Design Spec

**Date:** 2026-09-01
**Status:** Approved (design), pending implementation plan
**Origin:** Findings #3 (no enforced step sequencing) and #4 (inquiry not linked to the account it becomes) from the Lessor-module end-to-end simulation.
**Area:** Prisma (Inquiry model + enum) + server (auth/inquiry/profile/info-sheet) + client (Lessor Profile + Inquiries views).

## Problem

Two onboarding-integrity gaps surfaced in the simulation:
- **#3:** The lessor onboarding steps (unit approval, requirements, acceptance form) are independent with no ordering — an acceptance form can be approved before any unit or requirement is, and staff have no at-a-glance view of a lessor's onboarding progress.
- **#4:** A Lessor *inquiry* and the *account* that person later creates are unrelated rows. The journey from first contact to onboarded lessor is not captured, and converted inquiries linger in the open queue.

## Goal

- **#3:** Make onboarding progress visible (an advisory tracker on the Lessor Profile) and enforce the one meaningful gate: the acceptance form cannot be **approved** until the lessor has ≥1 approved unit and all requirements approved.
- **#4:** Auto-link the most recent matching open inquiry to a new lessor account on signup, mark it Converted, and surface the link.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| #3 sequencing | **Advisory tracker + one final guard.** No hard blocks on data entry; only the acceptance-form *approval* is gated. |
| #4 link trigger | **Auto-link on signup** by email match (most recent open matching inquiry). |
| #4 linked inquiry | **Mark `CONVERTED`** (leaves the open queue) + record the link. |

## Non-goals

- Hard-enforcing the full step order (requirements/form gated on units, etc.) — deliberately avoided to preserve O-Lease flexibility.
- A manual "convert inquiry to account" action (auto-link chosen).
- Retroactively linking historical inquiries to existing accounts (only new signups link).
- Changing the lessee flow's acceptance-form behaviour (no guard there).

## Architecture

### #4 — Inquiry linkage

**1. Data model (`server/prisma/schema.prisma` + additive SQL)**
- Add enum value: `enum InquiryStatus { NEW IN_PROGRESS CLOSED CONVERTED }`.
- Add to `model Inquiry`: `convertedUserId String?` and a relation `convertedUser User? @relation("InquiryConversion", fields: [convertedUserId], references: [id])`; add the back-relation `convertedInquiries Inquiry[] @relation("InquiryConversion")` to `model User`.
- Migration (`server/prisma/manual-migrations/2026-09-01-inquiry-conversion.sql`): `ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';` (own statement — Postgres cannot use a new enum value in the same transaction it is added, so this migration adds only the value + the nullable column + FK; no data statement uses `CONVERTED`), then `ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "convertedUserId" TEXT;` and the FK. Applied to dev + test; `prisma generate`. Not `prisma migrate` (history drift — see [[prisma-migration-drift]]).

**2. Server (`authService.signupPortalUser`)**
- After the `prisma.user.create`, best-effort link: find the most recent `Inquiry` where `email == contactEmail`, `inquirerType == (role === "UNIT_OWNER" ? "LESSOR" : "LESSEE")`, and `status in [NEW, IN_PROGRESS]`, ordered `createdAt desc`, take 1. If found, update it: `{ status: "CONVERTED", convertedUserId: user.id }`.
- Wrapped so a linkage failure never breaks signup (the account creation is the contract). Return value unchanged (adds nothing required).

**3. Display**
- `inquiryService.listInquiries` already returns inquiries with `status`; the client `InquiriesView` renders a **Converted** badge for `status === "CONVERTED"` (and the status filter, if any, includes it). Converted inquiries are excluded from the "open"/active view the same way `CLOSED` is (follow the existing status handling).
- `lessorProfileService.getLessorProfile` resolves the originating inquiry via the owner's linked `User` → `convertedInquiries` (most recent): returns `originInquiry: { id, inquiryType, createdAt } | null`. `LessorProfileView` shows an "Originating inquiry" line when present.

### #3 — Onboarding tracker + acceptance-form guard

**1. Tracker (`lessorProfileService.getLessorProfile`)**
Add a computed `onboarding` object (from data the service already loads — units, requirements checklist, latest info sheet):
```
onboarding: {
  steps: [
    { key: "account",        label: "Account approved",        done: true },
    { key: "units",          label: "Unit approved",           done: approvedUnits >= 1, detail: `${approvedUnits} approved` },
    { key: "requirements",   label: "Requirements complete",   done: reqApproved === reqTotal, detail: `${reqApproved} of ${reqTotal}` },
    { key: "acceptanceForm", label: "Acceptance form approved",done: acceptanceForm?.status === "APPROVED", detail: acceptanceForm?.status || "Not started" },
  ],
  stage: <label of the first step with done=false, else "Complete">,
  percent: Math.round(doneCount / steps.length * 100),
}
```
`approvedUnits` = units with `approvalStatus === "APPROVED"`; `reqApproved`/`reqTotal` come from the existing `requirements.summary`.

**2. Client (`LessorProfileView.vue`)**
A compact **Onboarding** panel near the top: the overall `stage` + `percent` (a small progress bar) and the four steps with a done/outstanding indicator + `detail`.

**3. Hard guard — acceptance-form approval (shared info-sheet service)**
- `makeInfoSheetService`/`makeInfoSheetRouter` gain an optional `approveGuard(fkId)` async callback. In `review(actor, id, { status, remarks })`, when `status === "APPROVED"` and `approveGuard` is set, call `await approveGuard(sheet[fkField])` before the update; it throws `ConflictError` (409) to block.
- The **lessor** router (`lessorInfoSheetRoutes.js`) supplies the guard: given a `unitOwnerId`, require `prisma.unit.count({ where:{ ownerId, approvalStatus:"APPROVED" } }) >= 1` (else 409 "needs at least one approved unit") and `lessorRequirementService.listForOwner(ownerId)` all `Approved` (else 409 "all requirements must be approved first (x/total)"). The guard lives in the route file (which may import prisma + the requirement service), keeping `infoSheet.js` generic.
- The **lessee** router passes no `approveGuard` — unchanged.

## Data flow

```
Lessor inquiry (email X) → signup (contactEmail X, UNIT_OWNER)
   → newest open LESSOR inquiry with email X → CONVERTED + convertedUserId=account
Staff → Lessor Profile → sees onboarding tracker (account→units→requirements→form) + originating inquiry
Staff → approve acceptance form → guard: ≥1 approved unit AND all requirements approved, else 409
```

## Error handling

- Signup linkage is best-effort: any error in the match/update is caught; the signup still succeeds. No match / lessee inquiry for a lessor / already-converted → simply no link.
- Acceptance-form approve with prerequisites unmet → 409 with a specific message (which prerequisite failed). Returning an already-submitted form or reviewing to `RETURNED` is unaffected (guard only runs for `APPROVED`).
- Profile for an owner with no linked user / no inquiry → `originInquiry: null`; onboarding steps compute from whatever exists (missing pieces = not done).

## Testing (Vitest / Supertest)

Server:
- Signup with a matching open LESSOR inquiry → that inquiry becomes `CONVERTED` with `convertedUserId` set; the account is still created PENDING.
- Signup with no matching inquiry → no inquiry changed, signup still succeeds.
- Two matching inquiries → only the newest is converted.
- A LESSEE inquiry with the same email is **not** converted by a UNIT_OWNER signup (type must match).
- Acceptance-form approve blocked (409) when the owner has 0 approved units; blocked (409) when requirements incomplete; succeeds once ≥1 approved unit and all requirements Approved. Lessee acceptance-form approve still works with no such guard.
- `getLessorProfile` returns `onboarding` with correct `done`/`stage`/`percent` for a partially-onboarded owner, and `originInquiry` when linked.

Client:
- `LessorProfileView` renders the onboarding panel (stage + steps) and an originating-inquiry line when present.
- `InquiriesView` renders a Converted badge for a converted inquiry.

## Rollout

Additive enum value + column via idempotent SQL (dev + test now; per-environment on deploy). `prisma generate`; rebuild client + restart server.

## Affected files

- `server/prisma/schema.prisma` + `server/prisma/manual-migrations/2026-09-01-inquiry-conversion.sql`
- `server/src/services/authService.js` (signup linkage); `server/src/services/lessorProfileService.js` (onboarding + originInquiry)
- `server/src/lib/infoSheet.js` (approveGuard hook); `server/src/routes/lessorInfoSheetRoutes.js` (lessor guard)
- `client/src/views/LessorProfileView.vue` (onboarding panel + inquiry line); `client/src/views/InquiriesView.vue` (Converted badge)
- Server + client tests
