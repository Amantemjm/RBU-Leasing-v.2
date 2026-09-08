# Lessor Unit Onboarding Pipeline — Design Spec

**Date:** 2026-09-08
**Status:** Approved (design), pending implementation plan
**Area:** Unit approval · leasing transactions · listing publication

## Problem

A lessor can already register a unit without an inquiry — no code in the unit
path references inquiries, and `Register Unit` is unconditionally available to
any approved `UNIT_OWNER`. Verified end to end against a lessor with zero
inquiries: signup → approval → register → submit all work.

What does not work is everything after that.

A leasing transaction is only opened two ways: an officer accepting an inquiry,
or staff creating one by hand. A self-registered unit therefore has **no
transaction** — and since a photoshoot is scheduled against a transaction
(`POST /appointments/transaction/:txnId/PHOTOSHOOT`), there is nowhere to book
the shoot. The officer cannot obtain photos through the process at all.

Meanwhile `publish()` checks only that the unit is `APPROVED` and has at least
one photo. A unit can go live with the lessor's document checklist untouched
and no photoshoot ever done. "Publish when everything is satisfied" is
convention, not a rule the system enforces.

The lessor also sees an empty Leasing Progress page throughout, because there is
no transaction to track.

## Goal

Make the lessor-initiated path a tracked pipeline:

**register → unit approval → upload requirements → review/approval →
unit inspection → photoshoot → publish**

Publication becomes the reward for completing that chain rather than something
an officer can do at any point.

## Decisions

| Topic | Decision |
|---|---|
| What opens the transaction | **Unit approval.** `approveUnit` calls a new `ensureForUnit`, mirroring the existing `ensureForInquiry`. |
| Start stage | **`SEND_REQUIREMENTS`**, with `INQUIRY` marked `Skipped` — the shape staff already get from `createTransaction({ startStage: "SEND_REQUIREMENTS" })`. |
| Scope | **Every unit approval**, not only self-registered units. Nothing records whether a unit was self-registered, so inferring it would be guesswork, and a staff-created unit needs the same pipeline. |
| Assigned officer | The owner's `assignedOfficer`; falls back to whoever approved the unit. |
| Idempotency | A unit that already has an open transaction does not get a second one. Covers rejected → resubmitted → re-approved. |
| Photoshoot timing | **End of the chain**, following the existing stage order. Not bookable early. |
| Publish gate | Unit `APPROVED` **and** all seven lessor requirements `Approved` **and** the photoshoot appointment `Completed` **and** at least one photo. |
| Photo source | **Staff only, unchanged.** Photos come from the officer after the shoot; the lessor never uploads them. |
| Key Turnover | **Removed from the pipeline.** It is not part of the lessor flow, so it goes from the shared stage registry entirely — there is only one stage list. Six stages remain. |

## Non-goals

- **Letting the lessor upload photos.** Explicitly rejected — photos come from
  the officer-run shoot.
- **Changing the registration form.** It is already one screen with a single
  required field (unit number). Nothing to simplify.
- **Notifications.** The lessor still learns of approval, rejection and
  scheduling by opening the portal. The system has no outbound channel and this
  spec does not add one.
- **Blocking a unit from the listing once a lessee is linked.** Decided
  separately — a unit comes off the market when a lessee is linked to its
  transaction — but that is lessee-side work and is deliberately out of scope
  here. See Related Work.

## Design

### 1. `ensureForUnit` (`leasingTransactionService.js`)

A sibling of `ensureForInquiry`, same shape and same idempotent contract:

```js
export async function ensureForUnit(unit, actor) {
  const existing = await openTransactionForUnit(unit.id);
  if (existing) return existing;

  const now = stampNow();
  const reference = await nextReference();
  const stageData = {
    INQUIRY: { status: "Skipped", completedAt: now },
    SEND_REQUIREMENTS: { status: "Pending", startedAt: now },
  };
  const txn = await prisma.leasingTransaction.create({
    data: {
      reference,
      stage: "SEND_REQUIREMENTS",
      status: "Pending",
      stageData,
      unitId: unit.id,
      unitOwnerId: unit.ownerId,
      assignedOfficerId: unit.owner?.assignedOfficerId || actor?.userId || null,
      // No lessee yet — this is the lessor bringing a unit to market.
      lesseeName: null,
    },
  });
  await logEvent(txn.id, actor,
    `Unit ${unit.unitNumber} approved — onboarding transaction ${reference} opened`,
    "SEND_REQUIREMENTS");
  return txn;
}
```

`openTransactionForUnit(unitId)` returns the unit's most recent transaction that
has not closed, or `null`. **Closed means `finalStatus` is `Signed` or
`Declined`** — those are only ever written at Contract Signing, so a transaction
anywhere earlier in the pipeline has `finalStatus === null` and counts as open.
Extracted as a named helper because the publish gate needs the same lookup.

`approveUnit` calls it after the status update, passing the actor. The approval
itself must not fail if transaction creation does — a unit that is approved but
somehow has no transaction is recoverable; an approval that half-applied is not.
Wrap the call and log rather than throw.

### 2. Publish gate (`unitListingService.js`)

`publish(user, unitId)` gains two checks. Order matters — report the earliest
unmet step first, so the officer fixes them in the order the process expects:

| Order | Check | Refusal |
|---|---|---|
| 1 | `unit.approvalStatus === "APPROVED"` | *"Only an approved unit can be published"* (existing) |
| 2 | All seven lessor requirements `Approved` | *"All lessor requirements must be approved first (4/7)"* |
| 3 | Photoshoot appointment `Completed` | *"The photoshoot has not been completed"* |
| 4 | At least one photo | *"Add at least one photo before publishing"* (existing) |

**Requirements check** reuses `listForOwner(unit.ownerId)` from
`lessorRequirementService`, which already completes the checklist from the shared
config so an untouched type reads as `Required`. The lessor acceptance form
already performs exactly this check (`lessorAcceptanceGuard`) — mirror it rather
than inventing a second way of asking the same question.

**Photoshoot check** looks for an `Appointment` at stage `PHOTOSHOOT` with
status `Completed`, on the unit's transaction. Querying the appointment rather
than `stageData` is more direct: it asks "did the shoot happen", not "is the
stage marker set".

A unit with no transaction fails check 3, which is correct — it has not been
through the process.

### 3. Client

`UnitListingView` shows what is outstanding **before** the officer clicks
Publish, listing the unmet steps the way the Contract Signing blockers do. The
button stays enabled — the server is the gate; the list is so the officer is not
guessing.

`MyLeasingProgressView` needs no change. Once a transaction exists the lessor's
tracker populates on its own.

### 4. Removing Key Turnover (`shared/leasingStages.js`)

The registry is a single shared list — there is no per-flow variant — so
dropping the stage from the lessor flow drops it from the system. The pipeline
becomes six stages:

**Inquiry → Send Requirements → Approval → Unit Inspection → Photoshoot →
Contract Signing**

`SCHEDULABLE_STAGES` loses `KEY_TURNOVER` and keeps two: Unit Inspection and
Photoshoot. Everything else in the registry is derived — `STAGE_KEYS`,
`isFinalStage`, `nextStageKey`, the tracker's step count — so no other
production code needs a change beyond one icon-map entry in `DeliveryTracker`
and two stale comments in `SchedulingPanel` and `UpcomingAppointment`.

**Live data was checked before deciding this.** No transaction is currently at
Key Turnover, so nothing is stranded mid-stage. One completed transaction
carries a stale `stageData.KEY_TURNOVER` key and there is one orphaned
`Appointment` row at that stage.

Neither is harmful: the tracker iterates `LEASING_STAGES`, so an unknown
`stageData` key renders nothing. The orphaned appointment is the one loose end —
`listForTransaction` returns every appointment for a transaction regardless of
stage, so it would surface with no label. **Delete Key Turnover appointment
rows as part of this change**, in the same additive-SQL style as the other
manual migrations. The office server may hold real ones; the migration reports
how many it removed rather than doing it silently.

## Tests

**Server**

1. Approving a unit opens a transaction at `SEND_REQUIREMENTS` with `INQUIRY` marked `Skipped`
2. It links the unit and its lessor, and takes the officer from the owner's assignment
3. Approving twice (reject → resubmit → approve) does not create a second transaction
4. A unit whose transaction has closed can open a fresh one
5. Publish refused when requirements are outstanding, naming the count
6. Publish refused when the photoshoot has not completed
7. Publish refused for a unit with no transaction at all
8. Publish succeeds once approved, requirements complete, shoot completed and a photo exists
9. Existing refusals (not approved, no photo) still fire, and in the stated order
10. A failure inside `ensureForUnit` does not roll back the approval

11. The registry has six stages in order, and `KEY_TURNOVER` is gone
12. `SCHEDULABLE_STAGES` holds exactly Unit Inspection and Photoshoot
13. Scheduling `KEY_TURNOVER` is refused as a non-schedulable stage
14. A transaction advances Unit Inspection → Photoshoot directly

**Client**

15. The tracker renders six milestones
16. The listing page lists the outstanding steps
17. It shows nothing when every step is satisfied

## Open items

1. **Existing approved units have no transaction.** There are six in the seeded
   demo and an unknown number on the office server. They will fail the publish
   gate at check 3 despite already being live. Three options: backfill a
   transaction for every approved unit; exempt units approved before this ships;
   or leave them, so re-publishing one requires walking it through the pipeline.
   **This needs a decision before deploy, not before implementation.**

2. **A unit with more than one transaction.** `openTransactionForUnit` returns
   the most recent open one. This should not arise for lessor-initiated units,
   but an inquiry pre-linked to the same unit can produce a second — which is
   the case the Related Work below addresses.

## Related work, deliberately not in this spec

When an inquiry carries a `unitId` and that unit already has an open
transaction, `ensureForInquiry` currently mints a **second** transaction rather
than attaching to the existing one. After this spec ships, every approved unit
has a transaction, so that becomes the normal case rather than an edge one.

The fix is small — set `inquiryId` on the existing transaction instead of
creating a new row — but it edits `ensureForInquiry`, which landed on 8 Sep
from another author, and it belongs to the lessee side of the flow. Tracked
here so it is not lost.
