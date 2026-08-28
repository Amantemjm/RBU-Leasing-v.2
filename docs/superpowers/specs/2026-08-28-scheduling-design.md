# Scheduling (Appointments) — Design Spec

**Date:** 2026-08-28
**Status:** Approved (design), pending implementation plan
**Sub-project:** H of the "Enhanced Lessor Process" program (the final one).
**Area:** New `Appointment` model/migration + server service/routes + client (staff panel + party card). Ties into the existing leasing-transaction stage engine.

## Problem

The leasing engine (sub-project A) runs each transaction through 6 stages. The last three — **Unit Inspection**, **Key Turnover**, **Photoshoot** — each already carry a `Scheduled` status, but nothing sets a date/time, tells the parties, or moves the stage when the visit happens. Scheduling is done off-system.

## Goal

A leasing officer schedules the Inspection / Turnover / Photoshoot on a transaction; the lessee and lessor see the appointment on their portals; the stage status stays in sync automatically as the appointment is scheduled, completed, or cancelled.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Scheduling flow | **Officer schedules directly**, parties are notified (in-app). No propose/confirm round-trip. |
| Entity shape | **One unified `Appointment`** linked to `(transaction, stage)`, covering all three stage types. |
| Lifecycle | **Standard**: `Scheduled → Completed`, plus `Rescheduled`, `Cancelled`, `No-show`. |
| Stage sync | **Auto-sync**: booking sets the stage to `Scheduled`; completing sets the stage's done status; cancelling returns it to `Pending`. |

## Non-goals (YAGNI)

- Email/SMS notifications (notify = in-app visibility + the transaction event feed).
- Lessor availability calendars, recurring slots, booking within published windows.
- Multi-attendee invites, ICS/calendar export, reminders.
- Scheduling for the non-schedulable stages (Inquiry / Requirements / Approval).

## Architecture

### 1. Shared config (`shared/leasingStages.js`)

Add a derived helper so server and client agree on which stages are schedulable and what each maps to on completion:

```js
// Stages that carry an appointment. `defaultOutcome` is the stage status set
// when its appointment is completed; `outcomeOptions` (inspection only) lets the
// officer pick a specific result at completion.
export const SCHEDULABLE_STAGES = {
  UNIT_INSPECTION: { defaultOutcome: "Passed", outcomeOptions: ["Passed", "Passed with Remarks", "For Rectification", "Failed"] },
  KEY_TURNOVER:    { defaultOutcome: "Completed" },
  PHOTOSHOOT:      { defaultOutcome: "Completed" },
};
export const SCHEDULABLE_STAGE_KEYS = Object.keys(SCHEDULABLE_STAGES);
export const APPOINTMENT_STATUSES = ["Scheduled", "Rescheduled", "Completed", "Cancelled", "No-show"];
```

Each `defaultOutcome`/`outcomeOption` value is a real status of its stage in `LEASING_STAGES` (Inspection has all four; Turnover/Photoshoot have `Completed`) — the plan must keep them in lockstep.

### 2. Data model (`server/prisma/schema.prisma` + additive SQL)

```prisma
model Appointment {
  id              String   @id @default(cuid())
  transaction     LeasingTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  transactionId   String
  stage           String   // one of SCHEDULABLE_STAGE_KEYS
  status          String   @default("Scheduled") // APPOINTMENT_STATUSES
  scheduledAt     DateTime
  location        String?
  notes           String?  // officer instructions, shown to the parties
  outcome         String?  // the stage status chosen at completion
  reason          String?  // cancellation/no-show reason
  rescheduleCount Int      @default(0)
  createdById     String?
  createdByName   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([transactionId, stage])
  @@index([transactionId])
}
```
Add the back-relation `appointments Appointment[]` to `model LeasingTransaction`. The migration is additive (new table). **Because the repo's Prisma migration history is currently diverged from the databases** (documented in sub-project G), apply the table via an additive, idempotent SQL script (`server/prisma/manual-migrations/2026-08-28-appointments.sql`, `CREATE TABLE IF NOT EXISTS`) run against dev + test, and regenerate the client — do not run `prisma migrate dev` (it demands a destructive reset). Reconciling the history is tracked as separate tech debt.

### 3. Server

**Service `server/src/services/appointmentService.js`** — all writes are staff-only; the acting user's name is stamped like the info-sheet metadata pattern.
- `listForTransaction(txnId)` → the transaction's appointments (0–3), ordered by stage.
- `listMine(user)` → appointments on transactions where the caller is the tenant or unit owner (portal read).
- `schedule(user, txnId, stage, { scheduledAt, location, notes })` — validates `stage ∈ SCHEDULABLE_STAGE_KEYS` and `scheduledAt` is a valid date; the transaction must exist and currently be at that stage (or the stage not yet past — see error handling); **upserts** the `(txn, stage)` row as `Scheduled`; sets the transaction's stage status to `"Scheduled"` (writing both the top-level `status` when `stage === transaction.stage` and the per-stage `stageData[stage].status`); appends a `TransactionEvent`.
- `reschedule(user, id, { scheduledAt, location?, notes? })` — updates the time, `status: "Rescheduled"`, `rescheduleCount++`; stage stays `Scheduled`; event.
- `complete(user, id, { outcome? })` — `status: "Completed"`; resolves the stage outcome = `outcome` (validated against that stage's `outcomeOptions`/statuses) or the stage's `defaultOutcome`; sets the stage status to that outcome (top-level + `stageData`); event.
- `cancel(user, id, { status = "Cancelled", reason? })` — `status ∈ {Cancelled, No-show}`; sets the stage status back to `"Pending"`; event.

Stage-status writes reuse the existing leasing-transaction stage helper (the same code path `setStage`/`stageData` updates already use) so validation and the event feed stay consistent. The service never advances the transaction to the next stage — advancing remains the officer's explicit action in the existing stage engine (completing an inspection sets `Passed`; the officer still advances to Turnover as today).

**Routes `server/src/routes/appointmentRoutes.js`** (mounted `/api/appointments`, all `verifyJwt`):
- `GET /transaction/:txnId` — staff + the transaction's tenant/owner.
- `GET /mine` — the calling party's appointments.
- `POST /transaction/:txnId/:stage` — staff (`requireWrite`): schedule.
- `PATCH /:id/reschedule` — staff: reschedule.
- `PATCH /:id/complete` — staff: complete.
- `PATCH /:id/cancel` — staff: cancel / no-show.

Route order: literal segments (`/mine`, `/transaction/...`) before `/:id/...`. Validation via a Zod schema in `server/src/validation/appointment.js`. Writes are captured by the existing audit middleware.

### 4. Client

- **`resource.js`**: an `appointments` wrapper — `forTransaction(txnId)`, `mine()`, `schedule(txnId, stage, body)`, `reschedule(id, body)`, `complete(id, body)`, `cancel(id, body)`.
- **Staff — Transaction Detail** (`client/src/views/TransactionDetailView.vue`, near the existing `DeliveryTracker`): a **Scheduling** panel. For each schedulable stage that the transaction has reached, show the appointment (badge + date/time + location + notes) or a "Schedule…" form (date-time, location, notes). Actions per appointment: **Reschedule**, **Complete** (inspection shows an outcome select from `outcomeOptions`; others complete directly), **Cancel / No-show** (with a reason). After any action, reload the transaction so the tracker reflects the synced stage status.
- **Portal card** (`client/src/components/UpcomingAppointment.vue`, shown in the lessee and lessor "My…" areas): read-only upcoming appointment(s) — stage label, date/time, location, notes, status badge. Loads via `appointments.mine()`.

## Data flow

```
Officer (Transaction Detail) → Schedule(stage, when) → Appointment Scheduled + stage → "Scheduled" + event
  → parties see it on their portal (mine) and on the tracker
Officer → Complete(outcome) → Appointment Completed + stage → outcome (Passed/Completed) + event
Officer → Reschedule → new time, Rescheduled, count++  |  Cancel/No-show → stage → "Pending"
```

## Error handling

- `stage ∉ SCHEDULABLE_STAGE_KEYS` → 400. Invalid/absent `scheduledAt` → 400 (Zod). `outcome` not valid for the stage → 400.
- Scheduling a stage the transaction has already completed (past that stage) → 409 Conflict ("that stage is already done"). Scheduling before the transaction has reached any schedulable stage is allowed (pre-booking) — the stage-status write only touches `stageData[stage]` unless it is the current stage.
- Reschedule/complete/cancel on a missing appointment → 404. Complete/cancel on an already-`Completed`/`Cancelled` appointment → 409.
- A party requesting another party's transaction appointments → 404 (scoped like the info-sheet/requirement pattern).
- Unknown transaction → 404.

## Testing (Vitest / Supertest)

Server:
- Schedule sets the row `Scheduled`, stamps `createdByName`, and sets the stage status to `Scheduled` (top-level when current stage; `stageData` always); logs an event.
- Reschedule updates time, sets `Rescheduled`, increments `rescheduleCount`.
- Complete without outcome sets the stage's `defaultOutcome` (Turnover → `Completed`); complete an inspection with `outcome: "Failed"` sets the stage to `Failed`; an invalid outcome → 400.
- Cancel and No-show set the stage back to `Pending`; wrong status value → 400.
- `@@unique([transactionId, stage])` — a second schedule for the same stage upserts (no duplicate row).
- Scoping: `GET /transaction/:id` and `/mine` — staff 200; the transaction's tenant/owner 200 for their own, 404 for others'; unrelated party 404.
- Non-staff write → 403. Scheduling a non-schedulable stage → 400. Scheduling a past/completed stage → 409.

Client:
- `resource.js` `appointments` methods hit the right URLs (verified like other resource tests).
- Staff panel: renders a schedule form for a reached stage; scheduling calls `appointments.schedule`; an existing appointment shows Reschedule/Complete/Cancel; completing an inspection sends the chosen outcome.
- Portal card: renders an upcoming appointment from a mocked `appointments.mine()`; empty state when none.

## Rollout

Additive table via the idempotent SQL script (dev + test now; per-environment on deploy, same as sub-project G, until the migration history is reconciled). Regenerate the Prisma client; rebuild client + restart server.

## Affected files

- `shared/leasingStages.js` (schedulable-stage config/helpers)
- `server/prisma/schema.prisma` + `server/prisma/manual-migrations/2026-08-28-appointments.sql`
- `server/src/services/appointmentService.js`, `server/src/controllers/appointmentController.js`, `server/src/routes/appointmentRoutes.js`, `server/src/validation/appointment.js` (new); `server/src/app.js` (mount)
- `client/src/lib/resource.js`; `client/src/views/TransactionDetailView.vue`; `client/src/components/UpcomingAppointment.vue` (new) + its placement in the lessee/lessor portal views
- Server + client tests
