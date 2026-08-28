# Acceptance Form Metadata — Design Spec

**Date:** 2026-08-28
**Status:** Approved (design), pending implementation plan
**Sub-project:** G of the "Enhanced Lessor Process" program.
**Area:** Info-sheet (Acceptance Form) system — shared by Lessor + Lessee. Schema/migration + shared service + display.

## Problem

The Acceptance Form (info sheet) already supports two submission methods (fill in-system / upload PDF) and staff review, and records `status`, `remarks`, `submittedAt`, `reviewedAt`. But it does **not** record **who submitted it**, **who reviewed it**, or the **form version** — so the form's provenance is incomplete.

## Goal

Record and surface the missing acceptance-form metadata: submitted-by, reviewed-by, and form version — for both the Lessor and Lessee Acceptance Forms (the service is shared).

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Scope | **Both** info-sheet types (shared service; one migration covers both tables). |
| Fields | `submittedByName`, `reviewedByName`, `formVersion` (names for display; the AuditLog keeps the full actor trail). |
| Version | A **config constant** stamped at submit time (not a per-record editable field). |

## Non-goals

- Version history / multiple form versions per record; changing the two submission methods; per-field audit.

## Architecture

### 1. Data model (+ migration)

Add to **both** `LessorInfoSheet` and `LesseeInfoSheet`:
```prisma
  submittedByName String?
  reviewedByName  String?
  formVersion     String?
```
One additive migration (3 columns × 2 tables, all nullable — existing rows unaffected).

### 2. Config

Add a `version` string to each config:
- `server/src/config/lessorInfoSheet.js`: `version: "2026-08"` (top-level, beside `title`).
- `server/src/config/lesseeInfoSheet.js`: `version: "2026-08"`.

### 3. Server — shared service (`server/src/lib/infoSheet.js`)

- `makeInfoSheetService({ ..., version })` gains the config `version`. Import `prisma` (from `./prisma.js`) to resolve actor names.
- Add a small `resolveName(user)` helper: `prisma.user.findUnique({ where:{id:user.userId}, select:{name:true,email:true} })` → `name || email || null`.
- **`submit(user, id, data)`** and **`submitPdf(user, id, buffer)`**: on the update, also set `submittedByName: await resolveName(user)` and `formVersion: version`.
- **`review(actor, id, { status, remarks })`**: change the signature to accept `actor`; set `reviewedByName: await resolveName(actor)` alongside status/remarks/reviewedAt.
- `makeInfoSheetRouter`: pass `config.version` into `makeInfoSheetService`; in the `PATCH /:id/review` route, pass `req.user` as the actor to `service.review`.

The existing `readOpts` (an `include` + optional `omit` of the binary field, no restrictive `select`) already returns the new columns, so list/detail responses include them automatically. No change to `lessorInfoSheetRoutes.js` / `lesseeInfoSheetRoutes.js` (they pass the config through).

### 4. Display

- **Staff sheet view** (`client/src/components/InfoSheetsStaff.vue`, used by Lessor Sheets + Lessee Sheets): show the metadata — **submitted by** + `submittedAt`, **reviewed by** + `reviewedAt`, **form version** — beside the existing status/remarks.
- **Lessor Profile** (D): extend `getLessorProfile`'s `acceptanceForm` to also return `submittedByName` and `formVersion`, and show them in the profile's Acceptance Form section.

## Data flow

```
Lessor/Lessee submits (in-system or PDF) -> submittedByName + formVersion stamped
Staff reviews (/:id/review) -> reviewedByName stamped (+ status/remarks/reviewedAt)
Staff sheet view + Lessor Profile display submitted-by/version/reviewed-by
```

## Error handling

- `resolveName` returns null if the user can't be resolved (never throws); metadata simply stays null.
- No behavior change to submit/review success/failure paths; the metadata is additive.

## Testing (Vitest / Supertest)

Server:
- Submitting a lessor sheet (structured data) stamps `submittedByName` (the submitter) and `formVersion` (the config version).
- Submitting a lessee sheet does the same (proves the shared service covers both).
- Reviewing stamps `reviewedByName` (the reviewing officer) and keeps status/remarks.
- Existing info-sheet tests still pass (the `review` signature change is internal; the route passes `req.user`).

Client:
- `InfoSheetsStaff` renders submitted-by, reviewed-by, and form version when present.
- Lessor Profile shows the acceptance form's submitted-by + version.

## Rollout

One additive Prisma migration. `prisma migrate deploy` per environment; rebuild client + restart server.

## Affected files

- `server/prisma/schema.prisma` + migration; `server/src/config/lessorInfoSheet.js`, `lesseeInfoSheet.js`; `server/src/lib/infoSheet.js`; `server/src/services/lessorProfileService.js`
- `client/src/components/InfoSheetsStaff.vue`, `client/src/views/LessorProfileView.vue`
- Server + client tests
