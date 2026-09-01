# System-wide UI/UX Consistency — Design Spec

**Date:** 2026-09-01
**Status:** Approved (design), pending implementation plan
**Area:** Client (Vue) — global stylesheet `client/src/styles/app.css` + the authenticated views/components. No backend changes.

## Problem

The app's UX is sound but has fragmented as it grew: the same button styles are re-declared (differently) in 6+ components; `.danger`/`.link` have no global definition; modal chrome isn't global (two reject modals render with **no backdrop/panel** — a real bug); the page header exists two ways; detail pages and dashboards use two different card systems; and the same action carries different labels, styling, and placement across views.

## Goal

One consistent, intuitive interface: a single source of truth for buttons, modals, headers, and cards; primary/secondary/destructive actions clearly and consistently distinguished; related actions grouped; consistent labels, spacing, and placement — **keeping the current visual language** (same green, tokens, sizing). Consistency, not a restyle.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Visual scope | **Consolidate, keep the look.** Unify the system; do not change the visual language. |
| Labels | **Standardize wording** — one label per action; update the few tests that assert exact labels. |

## Non-goals

- New features or new screens. A visual refresh/redesign. Backend changes. Changing the color palette or tokens.

## Standard (the single source of truth, in `app.css`)

### Buttons
Global classes, defined once, same look as today:
- **`.primary`** — accent fill, white text, `--shadow-sm`; hover `--accent-600`. The one main action per view/section.
- **`.secondary`** (and keep **`.ghost`** as an alias) — surface bg, `--line-strong` border, `--ink-700` text; hover paper bg. Secondary/cancel actions. `form button.cancel` maps to this.
- **`.danger`** — surface bg, `--danger` border + text; hover `--danger-050` tint. All destructive actions (Delete, Reject). Defined globally (was missing).
- **`.link`** — transparent, no border, `--accent-text`, underline on hover. Inline text actions. Defined globally (was missing).
- Keep the base `button {}` rule. Keep the positional primary for header actions but **extend it to `.head`** so both header patterns work: `.app-main section > header button, .app-main .head button, .app-main form button[type="submit"], .auth button`. A `.secondary`/`.ghost`/`.danger`/`.link` class overrides the positional primary (class beats element).
- **Decision buttons** map onto the set: Approve → `.primary`; Reject/Delete → `.danger`; Return / "send back" → `.secondary`. Remove the bespoke `.approve`/`.reject`/`.mini ok|warn|bad`/`.accept` button styling and use the standard classes.

### Modals (currently not global — fixes a real bug)
Global `.modal-backdrop` (fixed inset, dim overlay `rgba(15,22,33,.55)`, flex-center, `z-index:50`, padding), `.modal` (surface, `--radius`, `--shadow-lg`, `max-width`, padding, `max-height:85vh`, `overflow-y:auto`), `.modal h2` (margin), `.modal-actions` (flex end, gap, wrap). Keep the existing entrance animation. This gives Account Approvals + Approvals reject modals the backdrop/box they currently lack.

### Page header
One rule covers both `<header>` and `<div class="head">`: `.app-main section > header, .app-main .head { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1.5rem; }` — so the 4 views using `.head` stop hand-rolling it.

### Card / panel
A single global `.panel` (surface, `1px --line`, `--radius`, `--shadow-sm`, padding) used by detail pages; keep `.card` for the dashboards. Remove per-file `.panel` redeclarations so the global applies.

## Labels (normalized wording)

| Action archetype | Standard label |
|---|---|
| Commit a form (single save) | **Save** (drop "Save changes", "Create login", "Save fields", "Save reschedule") |
| Create a record from a list header | **New <thing>** (staff); owner self-serve stays **Register unit** |
| Add a sub-item | **Add <thing>** (drop the literal "+") |
| Dismiss/abort an action or form | **Cancel** (dismiss a read-only view stays **Close**) |
| Destructive | **Delete** (labelled text, not icon-only, where space allows) |
| Review decisions | **Approve** / **Reject** / **Return** kept as distinct meanings, styled primary/danger/secondary |

Section-specific saves on a page with *multiple* save buttons keep a distinguishing label (e.g. "Save status" vs "Save links" on Transaction Detail) — that's clarity, not inconsistency.

## Placement conventions (documented + applied)

- **List/CRUD views:** the primary "New <thing>" sits **top-right in the page header**; row actions (Edit/Delete) in the trailing table column.
- **Create/edit forms:** actions in a **bottom action bar**, primary rightmost, Cancel left of it.
- **Detail views:** stage/record actions grouped in a labelled action cluster; destructive/secondary distinct from primary.
- Every unstyled action gets its correct variant (fixes "Save as draft", "Manage listing & photos").

## Rollout (phased, test-gated — no screenshots available, so lean on the unchanged look + the test suite)

1. **Foundation** (`app.css`): add global `.danger`/`.link`/modal/`.head`/`.panel`, extend header primary, define `.secondary`. Additive — nothing breaks. Fixes the modal bug. **Checkpoint.**
2. **De-duplicate:** remove the ~15 per-component redeclarations (`.primary`/`.ghost`/`.danger`/`.link`/modal/`.head`/`.panel`); remap decision-button classes to the standard set.
3. **Apply per view:** fix unstyled/mis-styled actions, one Delete treatment, consistent placement.
4. **Labels:** normalize wording; update the affected client tests.
5. **Nav polish:** add group headers to the portal (owner/tenant) nav; consolidate the duplicate pending-action badge.

## Testing

- The full client suite (`npx vitest run`) must stay green after every phase; label changes update the few tests that assert exact button text. No new behavior — tests protect against regressions in the views' structure/labels the suite already covers.

## Affected files

- `client/src/styles/app.css` (the standard)
- De-dupe + apply: `AppLayout.vue`, `ResourceTable.vue`, `ResourceForm.vue`, `InfoSheetSelf.vue`, `InfoSheetsStaff.vue`, `SchedulingPanel.vue`, `ApprovalRouting.vue`, `TransactionDetailView.vue`, `UnitListingView.vue`, `InquiryView.vue`, `UsersView.vue`, `TransactionsView.vue`, `AccountApprovalsView.vue`, `ApprovalsView.vue`, `CmsFormBuilderView.vue`, `CmsFormsView.vue`, `RegisterUnitView.vue`, `UnitFormView.vue`, `MyUnitsView.vue`, `LessorProfileView.vue`, `LessorRequirementsView.vue`, `MyLessorRequirementsView.vue`, and other views as they surface.
- Client tests that assert exact labels (updated in the labels phase).
