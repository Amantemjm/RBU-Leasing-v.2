# Registration-First Lessor Onboarding — Design Spec

**Date:** 2026-09-14
**Status:** Approved (design), pending implementation plan
**Area:** Landing · signup · account approval · lessor requirements · auth

## Problem

The landing page card says "List your unit", but the flow behind it asks for an
account first and the unit second — as a step the applicant may skip outright
("Skip for now — I'll add it after approval"). The unit, the thing the lessor
came to do, is optional and last.

What follows is worse than out of order. It is invisible:

- A `PENDING` applicant cannot sign in (`loginUser` throws `AccountPendingError`),
  and the system has no outbound email. Between submitting and being approved
  they can learn nothing. They try to sign in periodically and infer the answer
  from the error.
- `rejectAccount` does not record a rejection. It runs
  `prisma.user.delete({ where: { id } })`. The `REJECTED` status it returns is
  synthetic and the `rejectionReason` column it ignores stays empty. A rejected
  applicant is not told why because there is no longer a row to tell.
- There is no state between approved and rejected, so an application with one
  wrong field is either waved through or destroyed.

The documents are mis-scoped too. `LessorRequirement` is
`@@unique([unitOwnerId, requirementKey])` — one set per person. Four of the
seven are property papers (Proof of Ownership, Tax Declaration, RPT Receipt,
Association Clearance) that differ per unit. A lessor with two units has one
Tax Declaration slot and no way to say which unit it belongs to.

## Goal

One seamless workflow, from the landing card to a verified unit, with the
applicant able to see where they are at every point:

**register unit → create account → application review → requirements →
verification → (existing listing pipeline)**

## Decisions

| Topic | Decision |
|---|---|
| Entry point | Landing "I'm a Lessor" → a new public `/register-unit` wizard. Unit first, account second. |
| Carrying the unit | **Client-held, single submit.** Nothing reaches the server until the final `POST /auth/signup`, which sends both. Reuses the existing `pendingUnit` column unchanged. |
| Unit optionality | **Required.** It is the entry point now, so the skip affordance goes. |
| Review granularity | **One decision covering both** — Approve, For Revision, or Reject. |
| Pre-approval visibility | A non-approved applicant **signs in** to a single restricted page showing the stepper, status and remarks. |
| Rejection | **Terminal, row kept**, with the reason shown. No longer deletes. |
| Requirement scope | **Split.** Four property papers per unit, three personal papers per owner. |
| Status vocabulary | **Pending Review · Approved · For Revision · Rejected**, one set across application and requirements. |
| Unit on approval | Created **`APPROVED`**, not `DRAFT` — see Behaviour changes. |

## Non-goals

- **Notifications.** Unchanged from the 2026-09-08 spec: there is no outbound
  channel. The restricted status page exists precisely because there is no
  email to send.
- **Changing the lessee path.** `/signup` keeps working as it does today for
  tenants, and for any lessor who arrives at it directly.
- **A second unit through the public flow.** An approved lessor registers
  further units from `/app/register-unit`, which is unchanged.
- **Reworking the listing pipeline.** Inspection, photoshoot and the publish
  gate keep their shape; only the requirement lookup inside the gate changes.
- **`FOR_REVISION` on `UnitApprovalStatus`.** Pre-approval corrections go
  through the application-level For Revision, so a second vocabulary on the unit
  would be unreachable code.

## Design

### 1. The public wizard (`/register-unit`)

A new public route, outside `/app`, rendered in `PublicShell` like the signup
page. Two steps, one component.

**Step 1 — Your unit.** Estate, tower, unit number (required), floor, type,
monthly rent, parking slot: the field set and hints from the authenticated
`RegisterUnitView`, which is already the better form. Estate and tower come
from the existing public reference endpoints (`/api/public/estates`,
`/api/public/towers`), added on 2026-09-10 for exactly this purpose.

**Step 2 — Your account.** Name, username, email, password, confirm, consent —
the current step 1 of `SignupView`, minus the role toggle. Arriving through the
lessor card fixes `role` to `UNIT_OWNER`; a visitor who wanted the lessee path
is one click from it in the shell.

Submit sends one request:

```js
POST /auth/signup { name, email, contactEmail, password, role: "UNIT_OWNER", consent: true, unit }
```

The server side of this already exists and does not change: `signupSchema`
whitelists the unit keys (`estateId`, `towerId`, `unitNumber`, `floor`,
`slotNo`, `type`, `baseRent`), validates estate and tower, and stores the rest
in `User.pendingUnit`.

Step 1's answers are mirrored into `sessionStorage` so a refresh mid-signup does
not discard them. They are cleared on successful submit. Nothing sensitive goes
in — the password lives only in component state.

`/signup?as=LESSOR` redirects to `/register-unit` so existing links and the
landing page agree.

### 2. Status model

One vocabulary for decisions, used wherever a person is waiting on O-Lease:

| Status | Meaning | Terminal |
|---|---|---|
| Pending Review | Submitted, awaiting a decision | no |
| Approved | Accepted | yes |
| For Revision | Fix the named problem and resubmit | no |
| Rejected | Will not proceed | yes |

**Application.** `AccountStatus` gains `FOR_REVISION`. `PENDING` keeps its name
in the database — it is the signup default and renaming it would touch every
approval query — and displays as "Pending Review". The existing
`rejectionReason` column carries the remarks for both `REJECTED` and
`FOR_REVISION`; a second column would only invite the two drifting apart.

**Requirements.** `For Resubmission` becomes `For Revision`, with a data
migration for existing rows. `Submitted` and `Under Review` both display as
"Pending Review" — they are the same thing to the person waiting. `Required`
stays, meaning nothing uploaded yet, and `Expired` stays.

### 3. Requirement scoping

`shared/lessorRequirements.js` gains a `scope` on each type:

| Scope | Requirements |
|---|---|
| `unit` | Proof of Ownership (Title/CCT), Tax Declaration, RPT Receipt, Association Clearance |
| `owner` | Valid Government ID, Authorization Letter / SPA, Bank Account Details |

`LessorRequirement` gains a nullable `unitId`. Owner-scoped rows leave it
`NULL`; unit-scoped rows set it.

The unique constraint cannot simply grow a column. Postgres treats `NULL`s as
distinct, so `@@unique([unitOwnerId, requirementKey, unitId])` would permit any
number of duplicate owner-scoped rows — the same property that lets
`TransactionDocument` hold many untyped attachments. Two partial indexes instead:

```sql
CREATE UNIQUE INDEX "LessorRequirement_owner_key_uniq"
  ON "LessorRequirement"("unitOwnerId","requirementKey") WHERE "unitId" IS NULL;
CREATE UNIQUE INDEX "LessorRequirement_unit_key_uniq"
  ON "LessorRequirement"("unitId","requirementKey") WHERE "unitId" IS NOT NULL;
```

Prisma cannot express a partial unique index, so these are declared in a manual
migration and the model carries `unitId` plus an `@@index`. Every write path
must therefore go through the service, not a bare `upsert` on a compound key.

**Existing rows.** All are owner-scoped. The migration moves the four property
papers onto the owner's unit **only where the owner has exactly one** — the
unambiguous case — and reports the remainder by `NOTICE` rather than guessing,
in the style of the Key Turnover migration. Owners with none or several keep
their rows owner-scoped, where they read as legacy and can be re-filed by hand.

**Consumers.** `publish()` in `unitListingService` and `lessorAcceptanceGuard`
both ask "are all seven approved for this owner". Both become "are the four
approved for *this unit* and the three approved for its owner". The refusal
message keeps naming a count so the officer knows how far off it is.

### 4. Restricted sessions

`issueToken` adds `status` to the payload. `loginUser` stops refusing
non-approved accounts: `PENDING`, `FOR_REVISION` and `REJECTED` all receive a
token, because all three need to read their own status page. Only the password
check gates entry, as now.

**The gate is server-side and fails closed.** `verifyJwt` is applied per route
file, so adding a `requireApproved` to each of the twenty-odd mounts would gate
nothing the day someone forgets one. Instead `verifyJwt` itself rejects any
token whose `status` is not `APPROVED`, and a separate export —
`verifyJwtAllowPending` — is used by the application-status routes alone. Every
existing route is then gated by default, and widening access is a visible,
deliberate edit.

The client route guard that sends a non-approved user to `/app/application` is
convenience only. It is not a security boundary and the spec does not treat it
as one.

### 5. Application status page (`/app/application`)

The only route a non-approved account can reach. It renders the stepper, the
current status, and:

| Status | Page offers |
|---|---|
| Pending Review | The submitted unit and account details, read-only |
| For Revision | The officer's remarks, and the unit form made editable |
| Rejected | The reason, read-only. No actions |
| Approved | A link into the portal (reached only if the page is open when approval lands) |

Resubmitting from For Revision writes the corrected `pendingUnit` and returns
the status to `PENDING`. The same whitelist as signup applies — this arrives
from a restricted session and must not be able to set `role`, `status` or
`unitOwnerId`.

### 6. Officer review

`AccountApprovalsView` already shows the unit an applicant applied with. It
gains a third action beside Approve and Reject:

- **Approve** — `approveAccount`, unchanged in shape: creates the `UnitOwner`,
  materialises `pendingUnit` into a `Unit`, and clears the column, all in one
  transaction.
- **For Revision** — `reviseAccount(id, approver, remarks)`: sets
  `FOR_REVISION` and the remarks. Remarks are required; "For Revision" with no
  explanation is the failure mode this status exists to prevent.
- **Reject** — `rejectAccount`, rewritten to set `REJECTED` and the reason
  rather than delete the row.

All three are refused unless the account is currently `PENDING` or
`FOR_REVISION`, preserving the existing "already decided" conflict check.

### 7. Progress indicator

One `OnboardingProgress` component, five steps:

**Unit details → Account → Application review → Requirements → Verification**

Rendered in three places: the public wizard (steps 1–2), the application status
page (step 3), and the lessor's portal until verification completes. Each step
carries one of the four statuses.

Steps 4 and 5 do not invent state. Unit approval already opens a leasing
transaction at `SEND_REQUIREMENTS` (2026-09-08 spec), so the component reads
those two steps from the transaction's stage and the unit's requirement rows.
When verification completes the existing `DeliveryTracker` takes over for
inspection, photoshoot and listing.

## Behaviour changes

Three things that shipped on 2026-09-10 change deliberately.

1. **Approval creates the unit `APPROVED`, not `DRAFT`.** `DRAFT` meant "the
   lessor has not finished describing this". Under this flow an officer has just
   reviewed those details as part of the same decision, so `DRAFT` would ask a
   second time for something already approved. It is also the seam that makes
   the workflow continuous: `approveUnit`'s `ensureForUnit` opens the
   transaction at `SEND_REQUIREMENTS`, which is the requirements step the
   applicant is told to expect next.

2. **The unit is required.** The "Skip for now" affordance is removed.

3. **Rejection keeps the row.** `server/tests/accountApproval.test.js` asserts
   the user is deleted; that expectation is now wrong and is rewritten, not
   deleted — it becomes an assertion that the row survives carrying the reason.

## Tests

**Server**

1. Signup with a unit still creates a `PENDING` user holding `pendingUnit` (regression)
2. Approving creates the owner, a unit with `approvalStatus APPROVED`, and clears `pendingUnit`
3. Approving opens the onboarding transaction at `SEND_REQUIREMENTS`
4. For Revision sets the status and remarks and keeps the row; empty remarks are refused
5. Resubmitting from For Revision rewrites `pendingUnit` and returns the status to `PENDING`
6. Resubmission cannot set `role`, `status` or `unitOwnerId` (whitelist)
7. Reject keeps the row with `REJECTED` and the reason — replaces the deletion assertion
8. A decision is refused on an account already `APPROVED` or `REJECTED`
9. Login succeeds for `PENDING`, `FOR_REVISION` and `REJECTED`, returning the status
10. **A restricted token is refused by a route using `verifyJwt`** — the security test
11. A restricted token reaches the application-status route
12. An approved token is unaffected on every route
13. Unit-scoped requirements are unique per unit; two units hold independent Tax Declarations
14. Owner-scoped requirements remain unique per owner across any number of units
15. The publish gate counts the four unit papers for that unit plus the three owner papers
16. The gate refuses when a sibling unit's papers are approved but this unit's are not
17. `lessorAcceptanceGuard` applies the same scoped check
18. The migration re-files property papers for a single-unit owner and leaves a multi-unit owner's alone

**Client**

19. The landing lessor card links to `/register-unit`
20. `/signup?as=LESSOR` redirects there
21. The wizard opens on the unit step and will not advance without a unit number
22. Step 1 answers survive a remount (`sessionStorage`), and are cleared after submit
23. Submitting posts account and unit in one request
24. The status page renders each of the four statuses, with remarks where present
25. For Revision exposes an editable unit form; the other statuses do not
26. The route guard sends a non-approved user to `/app/application` from any portal route
27. The stepper marks the current step and carries each step's status
28. The requirements page separates unit papers from owner papers and labels the owner set as shared

## Open items

1. **Approved lessors who predate this change** have owner-scoped property
   papers and, if they own several units, no unambiguous unit to attach them to.
   The migration reports them; someone must re-file them before those units can
   be published, since the gate will look for unit-scoped rows. Needs an
   operational decision before deploy, not before implementation.

2. **A rejected applicant's username stays taken.** Chosen deliberately, but it
   means a genuine re-application needs an officer to reopen the account. There
   is no self-service path and this spec does not add one.

3. **Two pages are called "register unit".** The public wizard is
   `/register-unit`; the authenticated single-unit form an approved lessor uses
   for their second unit stays `/app/register-unit`. Different trees, so there
   is no routing conflict, and the public name is kept because it is the wording
   on the landing card the applicant just clicked. Referred to throughout as
   *the wizard* and *the authenticated form* to keep them apart in review.
