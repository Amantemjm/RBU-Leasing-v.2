# Capture Unit of Interest on Lessee Inquiries — Design

**Date:** 2026-09-08
**Status:** Approved (design)

## Goal

When a lessee clicks **"Inquire about this unit"** on a public unit detail page, carry
that unit's id through the inquiry so it is:

1. persisted on the `Inquiry` record,
2. visible to staff in the Inquiries queue and on the resulting transaction, and
3. used at **accept** time to pre-fill the transaction's unit + lessor links (the
   officer can still override).

The feature is **optional and additive**: the front-page "Make an inquiry" flow and
lessor inquiries carry no unit and behave exactly as today.

## Background (current behavior)

- `Inquiry` has no unit reference. The public "Inquire about this unit" CTA
  ([client/src/views/UnitDetailPublicView.vue:142]) links to `/inquiry?as=LESSEE`; the
  unit of interest is only conveyed in the free-text `message`.
- An O-Lease officer **accepts** an inquiry ([server/src/services/inquiryService.js]
  `acceptInquiry`), which self-assigns it and calls `ensureForInquiry`
  ([server/src/services/leasingTransactionService.js:58]) to open a `LeasingTransaction`
  with only `lesseeName`, `inquiryId`, and `assignedOfficerId` — **no** unit/tenant/
  lessor link.
- The officer then links unit + lessee + lessor manually via `linkRecords` (PATCH
  `/link`). Linking a unit does not auto-derive its owner.

## Approach

**Persist `unitId` on the Inquiry; auto-link at accept.** (Chosen over "carry the unit
only in the URL/message" — that reference is gone by accept time — and over a manual
"link inquired unit" button, which keeps a step the auto-link removes.)

## Data model

Prisma migration history has drifted from the deployed databases, so schema changes are
applied via idempotent SQL, not `prisma migrate dev` / `db push`. See the project's
migration-drift note.

New file `server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql`:

```sql
-- Optional link from an inquiry to the specific unit the lessee is inquiring about.
-- Additive and idempotent, in line with the other manual migrations here — the
-- committed Prisma history has drifted on the deployed databases.
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

Apply to **dev** (`rbu_leasing`) and **test** (`rbu_leasing_test`) with
`prisma db execute --url ... --file ...`, then `prisma generate`.

`server/prisma/schema.prisma`:

- `Inquiry` gains:
  - `unit   Unit?  @relation(fields: [unitId], references: [id], onDelete: SetNull)`
  - `unitId String?`
- `Unit` gains the reverse relation: `inquiries Inquiry[]`

`onDelete: SetNull` means a deleted unit cleanly nulls the reference — no orphan, no
crash, and the accept flow simply falls back to manual linking.

## Data flow

1. **CTA** — `UnitDetailPublicView.vue` "Inquire about this unit" links to
   `/inquiry?as=LESSEE&unit=<unitId>` (the view already has `card.unitId`).
2. **Form** — `InquiryView.vue` reads `route.query.unit`. If present:
   - calls `publicUnits.get(unitId)` and renders a banner:
     "Inquiring about Unit <unitNumber> — <propertyName>".
   - holds `unitId` in form state (submitted, not user-editable).
   - **prefills `category` to `RESIDENCES`** by default. There is no RESIDENCES/OFFICES
     field on `Unit` to derive from, and the catalog is residential; the lessee can
     still switch to Offices. (Confirmed acceptable.)
   - if the fetch fails (unit gone/unpublished), silently drop the banner and proceed
     as a generic inquiry (still send `unitId`; the server will null it if invalid).
3. **Submit** — `POST /api/inquiries` includes `unitId`.
   - `inquiryCreateSchema` gains `unitId: z.string().optional()`.
   - `inquiryService.createInquiry` stores `unitId` **only if it resolves to a real
     unit**; otherwise stores `null`. An invalid/stale `unitId` never blocks the inquiry.
4. **Queue** — `InquiriesView.vue` shows a "Unit <unitNumber>" chip on rows that have a
   linked unit; `inquiryService` reads include a minimal unit summary
   (`{ id, unitNumber, building }`, no bytes).
5. **Accept** — `ensureForInquiry` (called from `acceptInquiry`): if the inquiry's
   `unitId` still resolves to a unit, set the new transaction's `unitId` and
   `unitOwnerId = unit.ownerId`, and log an event noting the pre-fill. If the unit is
   **not vacant/published**, additionally log a warning note so the officer sees it.
   The officer can change any link via the existing Link editor. `ensureForInquiry`
   stays idempotent — it only pre-links on first creation.

## Files touched

**Server**
- `server/prisma/manual-migrations/2026-09-08-inquiry-unit.sql` (new)
- `server/prisma/schema.prisma` — `Inquiry.unitId` + relation, `Unit.inquiries`
- `server/src/validation/inquiry.js` — optional `unitId` in `inquiryCreateSchema`
- `server/src/services/inquiryService.js` — store `unitId` on create (validated),
  include unit summary in reads used by the queue
- `server/src/services/leasingTransactionService.js` — `ensureForInquiry` auto-links
  unit + derives lessor; validity check + warning note

**Client**
- `client/src/views/UnitDetailPublicView.vue` — CTA carries `&unit=<id>`
- `client/src/views/InquiryView.vue` — read query, fetch unit for banner, prefill
  category, send `unitId`
- `client/src/views/InquiriesView.vue` — unit-of-interest chip on rows
- `client/src/lib/resource.js` — `inquiries.create` passes `unitId`

## Error & edge handling

- **Invalid `unitId` at submit** → stored `null`; inquiry still succeeds.
- **Unit deleted before accept** → FK `SetNull` already nulled it → no auto-link;
  officer links manually.
- **Unit exists but not vacant/published at accept** → auto-link unit + lessor **and**
  log a warning note.
- **Lessor** is a snapshot of `unit.ownerId` at accept; overridable.
- **No `unitId` anywhere** (front-page, lessor inquiries) → identical to today.

## Testing

**Server**
- `inquiryCreateSchema` accepts optional `unitId`; rejects nothing new when absent.
- `createInquiry`: stores a valid `unitId`; nulls an invalid one; inquiry still created.
- `ensureForInquiry`: with a valid `unitId` sets transaction `unitId` + `unitOwnerId`
  (= unit owner) and logs the pre-fill event; with a not-vacant unit also logs a
  warning; with a null/deleted unit leaves the transaction unlinked.
- Backward-compat: an inquiry without `unitId` opens an unlinked transaction as today.

**Client**
- `UnitDetailPublicView`: the CTA href includes `&unit=<id>`.
- `InquiryView`: with `?unit=`, renders the banner, prefills category `RESIDENCES`, and
  includes `unitId` in the submit payload; without it, the form is unchanged and sends
  no `unitId`.
- `InquiriesView`: a row with a linked unit shows the chip; a row without shows none.

## Out of scope (YAGNI)

- Inquiries-per-unit analytics/reporting (the persisted `unitId` will support it later).
- Capturing a unit for lessor inquiries (lessors do not inquire about a listed unit).
- Multi-unit inquiries.
- Notifying the lessor when an inquiry references their unit.

## Deployment note

Because this changes the schema, each environment must run the new manual-migration SQL
(dev + test locally; production per its own process) and then `prisma generate`, before
the new server code is deployed.
