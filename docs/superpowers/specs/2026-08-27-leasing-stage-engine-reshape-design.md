# Leasing Stage Engine Reshape — Design Spec

**Date:** 2026-08-27
**Status:** Approved (design), pending implementation plan
**Sub-project:** A of the "Enhanced Lessor Process" program (foundation for the tracker and,
later, the Scheduling sub-project H).
**Area:** Leasing transaction state machine (shared config + server service + tracker UI)

## Problem

The leasing transaction engine uses a single shared 10-stage list (`LEASING_STAGES`) —
Inquiry, Accept Inquiry, Unit Registration, Approval, Unit Shoot, Accomplishment Form, Letter
of Intent, Unit Inspection, Contract Signing, Final Status — for every transaction. The
lessor process the business actually runs is shorter and ordered differently, so the tracker
shows stages that do not match reality (e.g. Photoshoot early; LOI/Contract Signing that
aren't part of the lessor flow).

## Goal

Reshape the engine to the lessor flow, as a single shared 6-stage list:

**Inquiry** *(skippable)* → **Send Requirements** → **Approval** *(4-step routing)* →
**Unit Inspection** → **Key Turnover** → **Photoshoot** *(terminal)*.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Scope | One shared stage list (only lessor transactions run in practice). No separate per-role flows. |
| Granularity | **6 stages**, each a trackable step with its own status. |
| Approval | **Keep** the 4-step routing chain (Leasing → Management → Authorized Approver → Final Approval). |
| Terminal stage | **Photoshoot** is the last stage; its `Completed` status finalizes the transaction. |
| Inquiry | **Optional / skippable** — staff can start a registered lessor's transaction at *Send Requirements*, stamping Inquiry as `Skipped`. |
| Data | **No migration** — stages live in JSON `stageData`; transactions/inquiries tables are empty after the data clean. |

## Non-goals (separate sub-projects)

- Rich requirements checklist (sub-project F), Lessor Profile (D), Unit lifecycle Draft→…
  (E), Acceptance Form metadata (G), and the **Scheduling** subsystem for
  Inspection/Turnover/Photoshoot (H). This spec only defines the **stages and their
  transitions**; those stages become richer as later sub-projects land.

## Design

### 1. Stage list (`shared/leasingStages.js`)

Rewrite `LEASING_STAGES` to the 6 stages below, preserving the existing config shape
(`key, label, short, statuses, initial, done, lesseeAction`) so the service and tracker keep
working with no shape change. (`lesseeAction` keeps its field name to avoid churn in the
tracker; its text is lessor-facing guidance.)

| # | key | label | short | statuses | initial | done |
|---|---|---|---|---|---|---|
| 1 | `INQUIRY` | Inquiry | Inquiry | New Inquiry · Under Review · Qualified · Not Qualified · Declined · **Skipped** | New Inquiry | **Qualified** |
| 2 | `SEND_REQUIREMENTS` | Send Requirements | Requirements | Pending · Submitted · Incomplete · Complete | Pending | **Complete** |
| 3 | `APPROVAL` | Approval | Approval | Pending Submission · Submitted · Under Review · For Revision · Approved · Rejected | Pending Submission | **Approved** |
| 4 | `UNIT_INSPECTION` | Unit Inspection | Inspection | Pending · Scheduled · In Progress · Passed · Passed with Remarks · For Rectification · Failed · Rescheduled | Pending | **Passed** |
| 5 | `KEY_TURNOVER` | Key Turnover | Turnover | Pending · Scheduled · Completed · Rescheduled | Pending | **Completed** |
| 6 | `PHOTOSHOOT` | Photoshoot | Photoshoot | Pending · Scheduled · In Progress · Completed · Rescheduled | Pending | **Completed** |

- Keep `APPROVAL_ROUTING = ["Leasing", "Management", "Authorized Approver", "Final Approval"]`
  and `APPROVAL_STEP_STATUSES` unchanged.
- `isFinalStage(key)` returns true for **`PHOTOSHOOT`**; `FINAL_STATUSES` = Photoshoot's
  statuses. Helpers `stageIndex/stageByKey/nextStageKey/prevStageKey/isValidStatus` are
  generic and need no change.

### 2. Service (`server/src/services/leasingTransactionService.js`)

- **`ensureForInquiry`** (accepted-inquiry path): mark `INQUIRY = Qualified (completedAt)`
  and rest the transaction at **`SEND_REQUIREMENTS` (Pending)**. Remove the old
  `ACCEPT_INQUIRY` / `UNIT_REGISTRATION` seeding and the `"ACCEPT_INQUIRY"` log stage (log
  under `INQUIRY`).
- **`createTransaction(actor, data)`**: accept an optional **`startStage`** (defaults to the
  first stage `INQUIRY`). If `startStage` is later than `INQUIRY`, stamp every preceding
  stage as `{ status: "Skipped", completedAt }` in `stageData`, set `stage`/`status` to the
  chosen stage's `initial`. If `startStage === "APPROVAL"`, call `ensureApprovalSteps`
  (mirrors the `advance` behaviour). Realistic use is `SEND_REQUIREMENTS`.
- `advance`, `returnStage`, `ensureApprovalSteps`, `decideApprovalStep` are already generic
  over the stage list — no change beyond the new keys.

### 3. Validation (`server/src/validation/leasingTransaction.js`)

- Add optional `startStage` to `txnCreateSchema`, validated against `STAGE_KEYS`.

### 4. Tracker UI (`client/src/components/DeliveryTracker.vue`)

- Replace the `STAGE_ICON` map keys with the new stage keys, e.g.
  `INQUIRY: 📝, SEND_REQUIREMENTS: 📎, APPROVAL: ✅, UNIT_INSPECTION: 🔍, KEY_TURNOVER: 🔑,
  PHOTOSHOOT: 📸`.
- Change the "delivered" check from `currentStage === "FINAL_STATUS" && [Active, Completed]`
  to **`currentStage === "PHOTOSHOOT" && (status/finalStatus === "Completed")`**.
- The rest of the tracker is generic over `LEASING_STAGES`.

### 5. Staff "New transaction" create (`client/src/views/TransactionsView.vue`)

`createNew()` today is a bare name prompt calling `leasingTransactions.create({ lesseeName })`.
Enhance it into a small dialog with the name plus a **"Start at: Inquiry / Send
Requirements"** choice, POSTing the chosen `startStage` (default Inquiry). Extend the client
`leasingTransactions.create` wrapper (`lib/resource.js`) to pass `startStage`. (The
accepted-inquiry path never uses this — that lessor inquired.)

## Data flow

```
Accepted inquiry → ensureForInquiry → INQUIRY=Qualified, rest at SEND_REQUIREMENTS
Staff create (startStage=SEND_REQUIREMENTS) → INQUIRY=Skipped, rest at SEND_REQUIREMENTS
Advance: SEND_REQUIREMENTS(Complete) → APPROVAL → (4-step routing → Approved) → advance
       → UNIT_INSPECTION(Passed) → KEY_TURNOVER(Completed) → PHOTOSHOOT(Completed = final)
```

## Error handling

- `setStatus`/`advance` reject a status not valid for the current/next stage
  (`isValidStatus`) → 4xx via existing `InvalidReferenceError`.
- `createTransaction` with an unknown `startStage` → validation error.
- Advancing past `PHOTOSHOOT` → existing "already at the final stage" conflict.

## Testing

Update the stage references and add cases in:
- `server/tests/leasingTransactions.test.js` — new stage keys/statuses; `ensureForInquiry`
  rests at `SEND_REQUIREMENTS`; `createTransaction` with `startStage: "SEND_REQUIREMENTS"`
  stamps Inquiry `Skipped`; advancing to `PHOTOSHOOT`/`Completed` sets `finalStatus`.
- `server/tests/leasingApproval.test.js` — routing still gates the `APPROVAL` stage.
- `client/tests/DeliveryTracker.test.js`, `client/tests/TransactionDetailView.test.js` — new
  keys, terminal = Photoshoot.

## Data / rollout

- **No DB migration.** Stage keys are stored in the JSON `stageData`/`stage` columns; the
  transactions and inquiries tables are empty after the data clean, so there are no old stage
  values to convert.
- Rebuild the client and restart the server after merge.

## Affected files

- `shared/leasingStages.js`
- `server/src/services/leasingTransactionService.js`
- `server/src/validation/leasingTransaction.js`
- `client/src/components/DeliveryTracker.vue`
- `client/src/views/TransactionsView.vue` (create dialog) + `client/src/lib/resource.js` (pass `startStage`)
- Tests listed above
