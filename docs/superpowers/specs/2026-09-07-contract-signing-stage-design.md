# Contract Signing Stage — Design Spec

**Date:** 2026-09-07
**Status:** Approved (design), pending implementation plan
**Area:** Leasing transaction state machine (shared config + server service + transaction UI)

## Problem

The lessor pipeline ends at Photoshoot. That is the right end for *bringing a unit to
market* — but it is not the end of the work. Once a unit is shot and listed, a prospective
tenant appears, issues a Letter of Intent, and the parties sign a contract. Today the system
has nowhere to record either document, and a transaction that has found a tenant looks
identical to one still waiting for its shoot to be scheduled.

The 2026-08-27 stage-engine reshape removed `Letter of Intent` and `Contract Signing` from a
then-10-stage list on the grounds that they "aren't part of the lessor flow". That was
correct for the flow as scoped at the time. **This spec deliberately reverses part of that
decision**, because the prospect-tenant case is now in scope. It brings back Contract
Signing as a real stage, and the Letter of Intent as the document that gates entry to it —
not as a stage of its own.

## Goal

Extend the pipeline to seven stages:

**Inquiry** → **Send Requirements** → **Approval** → **Unit Inspection** → **Key Turnover** →
**Photoshoot** → **Contract Signing** *(terminal)*

Entry to Contract Signing requires a linked prospect tenant **and** an uploaded Letter of
Intent. The stage closes when the signed contract is uploaded.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Who uploads the LOI | **Leasing officer**, on the transaction. Both documents change hands outside the system; RBU only holds them. |
| Photoshoot done, no prospect yet | **Park at Photoshoot** with a new status, **`Awaiting Prospect`**, so "live and being marketed" is visible on the tracker and countable on the dashboard. |
| Contract Signing shape | **Upload-only. No appointment.** Signing happens outside the system, like the LOI. Not added to `SCHEDULABLE_STAGES`. |
| What closes the stage | **Uploading the signed contract sets `Signed`.** The upload *is* the completion — the transaction cannot close without the executed document on file. |
| LOI upload effect | **Auto-advances** into Contract Signing when a tenant is linked. Symmetric with the signed contract closing the stage: the upload is the action. |
| Document storage | A nullable **`docType`** column on the existing `TransactionDocument`, not a new model. |
| Document visibility | Existing `TransactionDocument` rule — staff plus the linked lessor and lessee. *Assumed; see Open Items.* |
| Existing transactions | Left untouched. No backfill, no reopening. *Assumed; see Open Items.* |

## Non-goals

- **No notification of any kind.** The lessor and lessee learn a contract is ready by opening
  the portal, as with every other handoff. The system has no outbound channel (see the Role
  Playbook, G-01); adding one is not in this spec's scope.
- **No contract drafting, templating or e-signature.** The system stores a PDF someone else
  produced.
- **No lessee-side upload.** The LOI reaches RBU by email or in person and the officer
  attaches it.
- **No change to the six existing stages** beyond one added Photoshoot status.

## Design

### 1. Stage registry (`shared/leasingStages.js`)

Append a seventh entry to `LEASING_STAGES`, preserving the existing config shape:

| # | key | label | short | statuses | initial | done |
|---|---|---|---|---|---|---|
| 7 | `CONTRACT_SIGNING` | Contract Signing | Signing | Pending · For Signature · Signed · Declined | Pending | **Signed** |

`lesseeAction`: *"Sign the lease contract."*

Add **`Awaiting Prospect`** to `PHOTOSHOOT.statuses`. Its `done` status stays `Completed` —
`Awaiting Prospect` is a resting state, not a completion.

**`isFinalStage` must stop being hardcoded.** It currently reads
`return key === "PHOTOSHOOT";`, which is precisely what breaks when a stage is appended —
`finalStatus` would never again be written. Derive it:

```js
export function isFinalStage(key) {
  return key === STAGE_KEYS[STAGE_KEYS.length - 1];
}
```

`FINAL_STATUSES` already derives from the last stage and needs no change. The generic
helpers (`stageIndex`, `stageByKey`, `nextStageKey`, `prevStageKey`, `isValidStatus`) need no
change. `SCHEDULABLE_STAGES` is **not** extended — Contract Signing carries no appointment.

### 2. Document type registry (new — `shared/transactionDocuments.js`)

Mirrors the shape of `shared/lessorRequirements.js`, so both server and client read one
source and cannot drift:

```js
export const TRANSACTION_DOCUMENT_TYPES = [
  { key: "LETTER_OF_INTENT", label: "Letter of Intent",
    stage: "PHOTOSHOOT",        gate: "advance"  },
  { key: "SIGNED_CONTRACT",  label: "Signed Lease Contract",
    stage: "CONTRACT_SIGNING",  gate: "complete" },
];
```

Plus `TRANSACTION_DOCUMENT_KEYS`, `docTypeByKey(key)` and `labelForDocType(key)`.

A document with `docType = null` is an ordinary loose supporting attachment, exactly as
today. Nothing about existing uploads changes.

### 3. Schema (`TransactionDocument`)

```prisma
docType String?   // LETTER_OF_INTENT | SIGNED_CONTRACT; null = loose supporting document

@@unique([transactionId, docType])
```

Postgres treats `NULL` as distinct in a unique index, so a transaction may still hold any
number of loose attachments while holding at most one of each typed document. Re-uploading a
typed document therefore **replaces** it — the same upsert semantics as the lessor and
lessee requirement checklists.

**Migration:** `server/prisma/manual-migrations/2026-09-07-transaction-document-types.sql`,
idempotent and additive per project convention:

```sql
ALTER TABLE "TransactionDocument" ADD COLUMN IF NOT EXISTS "docType" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionDocument_transactionId_docType_key"
  ON "TransactionDocument" ("transactionId", "docType");
```

> **Deployment note.** This is now the *second* manual migration pending on the office
> server. `2026-09-07-lessee-requirements.sql` is still unapplied there. Both must run
> before the next deploy.

### 4. Server — `leasingTransactionService.js`

**`advance` gains a precondition when leaving Photoshoot:**

```js
if (txn.stage === "PHOTOSHOOT") {
  if (!txn.tenantId) {
    throw new ConflictError("Link a prospect tenant before Contract Signing");
  }
  const loi = await prisma.transactionDocument.findFirst({
    where: { transactionId: id, docType: "LETTER_OF_INTENT" },
  });
  if (!loi) {
    throw new ConflictError("Upload the Letter of Intent before Contract Signing");
  }
}
```

No other stage transition changes. Advancing *into* Contract Signing sets
`finalStatus = "Pending"` through the existing `isFinalStage` branch, which also overwrites
any stale `finalStatus` left on the row from when Photoshoot was terminal — so no data fix
is needed for that.

**`addDocument` takes a `docType` and acts on it.** Typed uploads upsert on
`(transactionId, docType)`; untyped ones create as they do now. After the write:

| Upload | Transaction state | Effect |
|---|---|---|
| `LETTER_OF_INTENT` | Photoshoot, tenant linked | Calls `advance` — so the event log, `stageData` and `completedAt` stay consistent with every other transition |
| `LETTER_OF_INTENT` | Photoshoot, no tenant | Stored only. **Does not advance, and does not touch the stage status** — the shoot may not even have happened yet, and `Awaiting Prospect` is owned by photoshoot completion (§5), not by this upload. |
| `SIGNED_CONTRACT` | Contract Signing | Calls `setStatus("Signed")`, which writes `finalStatus` via `isFinalStage` |
| `SIGNED_CONTRACT` | any other stage | Stored only. No status change. |
| anything | any | `TransactionEvent` logged with the document label |

An unknown `docType` is rejected with `400 Unknown document type`.

**`linkRecords` clears the waiting state.** Linking a tenant while the transaction sits at
Photoshoot / `Awaiting Prospect` returns the stage to `Completed` — a prospect has appeared,
so the shoot is simply done again and the transaction is ready for its LOI.

### 5. Server — `appointmentService.js`

`complete()` decides the Photoshoot stage status from whether a prospect exists. The
appointment's own `outcome` stays `Completed` — the shoot did complete; only the stage's
resting status differs:

```js
let stageStatus = outcome;
if (appt.stage === "PHOTOSHOOT" && outcome === "Completed" && !txn.tenantId) {
  stageStatus = "Awaiting Prospect";
}
await syncStageStatus(txn, appt.stage, stageStatus);
```

### 6. Client

| File | Change |
|---|---|
| `components/DeliveryTracker.vue` | **None.** Already derived from `LEASING_STAGES.length`; grows to seven steps on its own. |
| `components/TransactionDocuments.vue` | Upload gains a type selector (Letter of Intent · Signed Lease Contract · Other). The two typed slots render as a labelled pair above the loose attachment list, each showing filename, uploader and date, or an empty slot. |
| `views/TransactionDetailView.vue` | At Photoshoot, show what is blocking advance — "Link a prospect tenant" and/or "Upload the Letter of Intent" — rather than letting the officer click Advance into a 409. |
| `lib/resource.js` | Pass `docType` on the upload call. |
| `views/MyLeasingProgressView.vue` | **None.** Picks up the seventh step and its `lesseeAction` from the registry. |

### 7. Tests (written first, per project convention)

**Shared** — `shared/leasingStages` has seven stages in order; `isFinalStage` is true for
`CONTRACT_SIGNING` and false for `PHOTOSHOOT`; `SCHEDULABLE_STAGES` still has exactly three
keys; `Awaiting Prospect` is a valid Photoshoot status.

**Server**

1. Advancing from Photoshoot with no tenant → `409 Link a prospect tenant before Contract Signing`
2. Advancing with a tenant but no LOI → `409 Upload the Letter of Intent before Contract Signing`
3. Advancing with both → moves to Contract Signing at `Pending`, `finalStatus = "Pending"`
4. Uploading the LOI with a tenant linked auto-advances, and logs one event
5. Uploading the LOI with no tenant stores the file and leaves both stage and status untouched
6. Completing the photoshoot appointment with no tenant rests at `Awaiting Prospect`; the appointment's own outcome is still `Completed`
7. Linking a tenant at `Awaiting Prospect` returns the stage to `Completed`
8. Uploading the signed contract at Contract Signing sets `Signed` and writes `finalStatus`
9. Re-uploading a typed document replaces rather than stacks; loose attachments still stack
10. An unknown `docType` is rejected `400`
11. Advancing past Contract Signing → `409 The transaction is already at the final stage`
12. A linked lessor and lessee can download both typed documents; an unlinked party cannot

**Client** — the tracker renders seven steps; the type selector posts the chosen `docType`;
the Photoshoot blocker hint names the missing prerequisite.

## Open items

Two calls were made in the absence of a stated rule. Both are cheap to reverse now and
expensive later.

1. **Document visibility.** Typed documents inherit the existing `TransactionDocument`
   access rule, so the linked lessor *and* lessee can download both the LOI and the signed
   contract on their own transaction. The signed contract is clearly right — both parties
   are signatories. The LOI is the lessee's own document addressed to the lessor, so sharing
   it between them is defensible, but it is a privacy decision rather than a technical one.
   **If either document should be staff-only, say so before implementation** — it is a
   condition in one access check, versus a data migration afterwards.

2. **Existing transactions at Photoshoot.** They are left exactly as they are: no backfill,
   no reopening. Anything sitting at Photoshoot / `Completed` today simply stops being the
   end of the line — it will not advance until someone links a tenant and uploads an LOI,
   and nothing forces them to. Stored `finalStatus` values are untouched and are overwritten
   correctly if and when the transaction reaches Contract Signing.

## Risks

- **`isFinalStage` is load-bearing and currently wrong-by-construction.** Deriving it is
  required, not optional. Anything that reads `finalStatus` — the dashboard, exports —
  should be re-checked once seven stages exist.
- **Two manual migrations now pending on the office server.** Neither fails at startup; both
  fail at first use with a 500.
- **`Awaiting Prospect` is stored state that mirrors a derivable fact.** It is set in one
  place (photoshoot completion with no tenant) and cleared in one (a tenant being linked).
  Two writers is the minimum to keep it truthful, but it is really just
  `stage === PHOTOSHOOT && !tenantId` held by hand, and any third path that sets a tenant
  would have to remember it. If it drifts, the fallback is to derive it for display rather
  than store it.
