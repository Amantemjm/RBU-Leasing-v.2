# Lessor signup captures their first unit

**Date:** 2026-09-10
**Status:** Approved for planning

## Why

The landing page's *I'm a Lessor — List your unit* card goes to
`/signup?as=LESSOR`, which ends at "Application received… You will not be able
to sign in until it is approved." The lessor cannot list anything. The unit form
lives at `/app/register-unit` behind `roles: ["UNIT_OWNER"]` and needs an
approved, signed-in account.

The button promises one thing and delivers another.

It cannot simply be wired to the unit form, because a unit cannot exist yet.
`Unit.ownerId` is required, and `server/src/services/authService.js:105` records
why no `UnitOwner` is created at signup:

> the linked UnitOwner/Tenant record is deliberately NOT created here — it is
> created on approval, so the Owners and Tenants lists only ever contain vetted
> parties.

That invariant stays. Instead the unit is **described** during signup, held with
the application, and **materialised** on approval in the same transaction that
creates the owner.

## What we are building

### 1. Public estate and tower lookup

`GET /api/estates` and `GET /api/towers` both sit behind `verifyJwt`
(`server/src/routes/estateRoutes.js:6`, `towerRoutes.js:6`), and signup is
unauthenticated, so the dropdowns cannot populate today.

Add two read-only unauthenticated endpoints alongside the existing
`/api/public/units`:

- `GET /api/public/estates` → `[{ id, name }]`
- `GET /api/public/towers?estateId=<id>` → `[{ id, name }]`

They return **id and name only** — no counts, no ownership, no rent, nothing
that is not already implied by the published listings. `estateId` is required on
the towers endpoint; without it, respond `400`. The existing authenticated
endpoints are unchanged; this is additive.

This is new unauthenticated surface, accepted deliberately: the data is the
public names of Ortigas Land estates and towers, which already appear in the
public listings API. The alternatives were free-text estate/tower, which wrecks
data quality and hands the officer reconciliation work, or omitting the fields
and making the officer fill them in by hand.

### 2. Where the unit lives before approval

A nullable `pendingUnit` JSONB column on `User`.

Manual migration, idempotent and additive, in `server/prisma/manual-migrations/`:

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingUnit" JSONB;
```

The column holds a **whitelisted** object, never the raw request body — this
arrives from an unauthenticated endpoint:

```js
{ estateId, towerId, unitNumber, floor, slotNo, type, baseRent }
```

`unitNumber` is required when a unit is supplied. `estateId` and `towerId`, when
present, must reference rows that exist at signup time; reject with `400`
otherwise. Every other field is optional and stored as given after trimming.

### 3. Signup captures the unit

`SignupView` gains a second step, rendered **only** when the chosen role is
`UNIT_OWNER`. A tenant never sees it. The landing card's `?as=LESSOR` already
preselects that role.

The step carries the same seven fields as `RegisterUnitView` — estate, tower,
unit number, floor, parking slot no., unit type, monthly rent — with unit number
the only required one, and a **Skip for now — I'll add it after approval**
control. Skipping submits the application with no unit, exactly as today.

The confirmation screen names the captured unit when there is one, so the lessor
can see that their unit was recorded, rather than only "Application received".

The officer's Account Approvals card shows the pending unit for the same reason:
they should see what unit an applicant is claiming before deciding. That
requires `pendingUnit` to be added to `PENDING_SELECT`, the explicit `select`
that `listPendingAccounts` uses (`server/src/services/authService.js:146`) — an
explicit select means a new column is invisible until it is named there. The
card renders the unit number with the tower name when one was chosen, and says
nothing at all when the applicant skipped the step.

### 4. What approval does

`approveAccount` (`server/src/services/authService.js:168`) already creates the
`UnitOwner` inside `prisma.$transaction` together with the status change. It
gains one step: when the applicant is a `UNIT_OWNER` and `pendingUnit` is not
null, create the `Unit` in that same transaction and clear the column.

The unit is created with:

- `ownerId` — the `UnitOwner` just created in this transaction
- `approvalStatus: "DRAFT"` — set **explicitly**. The schema default is
  `APPROVED` (`schema.prisma`), which would skip review entirely.
- `baseRent` — the captured rent, or `0` when the lessor left it blank.
  `baseRent` is a required `Decimal` in the schema while the form field is
  optional, so a fallback is mandatory. The lessor edits it before submitting.
- the remaining whitelisted fields as captured.

**A stale reference must not break approval.** If the recorded `towerId` no
longer exists when the officer approves, create the unit without the tower
rather than failing the approval. An applicant must never become unapprovable
because reference data changed underneath them. The same applies to `estateId`,
which the `Unit` model does not store directly — it exists in `pendingUnit` only
to drive the tower dropdown.

### 5. What happens next needs no new code

`MyUnitsView` already lists DRAFT units with **Edit** and **Submit** actions,
and `submitUnit` already accepts `DRAFT` and `REJECTED`. So after approval the
lessor signs in, finds the unit waiting under My Units, completes anything they
skipped, and submits it. The officer approves the unit through the existing
flow, which opens the onboarding transaction via `ensureForUnit`.

The pipeline is unchanged end to end:

```
register (at signup) → account approval → unit appears as DRAFT
  → lessor submits → unit approval → requirements → inspection → photoshoot
```

Note the unit is created as DRAFT rather than SUBMITTED deliberately:
`approveUnit` refuses anything that is not `SUBMITTED`
(`unitService.js:71`), and a unit captured during signup may be missing rent and
other details. The lessor completes it and submits it themselves.

### 6. Rejection needs no work

`rejectAccount` deletes the account row outright
(`server/src/services/authService.js:204`), so `pendingUnit` goes with it. No
orphan is possible, and no `Unit` was ever created.

## Testing

**Server:**

- `GET /api/public/estates` returns id and name for every estate, with no token.
- `GET /api/public/towers?estateId=…` returns that estate's towers, with no token.
- `GET /api/public/towers` without `estateId` responds `400`.
- Neither endpoint exposes a field beyond `id` and `name`.
- Signup with a unit stores the whitelisted `pendingUnit`; fields outside the
  whitelist are dropped rather than persisted.
- Signup with a unit but no `unitNumber` responds `400`.
- Signup with an `estateId` or `towerId` that does not exist responds `400`.
- Signup without a unit leaves `pendingUnit` null.
- A `TENANT` signup never stores a `pendingUnit`.
- Approving a lessor with a `pendingUnit` creates the `UnitOwner` and the `Unit`
  together, sets `approvalStatus: "DRAFT"`, links the unit to the new owner, and
  clears `pendingUnit`.
- Approving with a blank rent gives the unit `baseRent` `0`.
- Approving when the recorded tower no longer exists still approves, and creates
  the unit without a tower.
- Approving a lessor with no `pendingUnit` behaves exactly as it does today.
- Rejecting an application with a `pendingUnit` creates no `Unit`.

**Client:**

- Step 2 renders for `UNIT_OWNER` and never for `TENANT`.
- `?as=LESSOR` reaches step 2 without the visitor changing the role.
- Skip submits an application with no unit.
- Submitting with a unit sends the seven fields.
- The confirmation names the captured unit, and does not when it was skipped.
- The Account Approvals card shows a pending applicant's unit.

## Out of scope

- `RegisterUnitView`, `MyUnitsView`, and the unit approval flow are unchanged.
- The onboarding pipeline and `ensureForUnit` are unchanged.
- More than one unit at signup. A lessor with several registers the rest from
  My Units after approval.
- The authenticated `/api/estates` and `/api/towers` endpoints are unchanged.
