# Landing Page as Role-Selection Entry Point — Design

**Date:** 2026-09-09
**Status:** Approved (design)

## Goal

Make the public front page (`/`) a **role-selection entry point** only. The
Featured Properties listing must NOT appear on the landing page; it becomes the
destination a **lessee** reaches after choosing their role. A **lessor** is sent
to Unit Owner signup so they can register and eventually list a unit.

## Background (current behavior)

- `/` renders `AvailableUnitsView.vue`, which contains BOTH the role-selection
  hero ("Home Lease, Made Simple" with two choice cards) AND the Featured
  Properties grid + filters below it.
- The hero CTAs currently both go to the inquiry flow:
  `Get started` → `/inquiry?as=LESSEE`, `List your unit` → `/inquiry?as=LESSOR`.
- `/units-for-lease` redirects to `/` (legacy); `/units-for-lease/:id` is the
  public unit detail page (its gallery's "Inquire about this unit" CTA carries
  the unit id — the recently shipped feature).
- `/signup` (`SignupView.vue`) is public self-registration with a Lessor/Lessee
  role toggle (`role` ref defaults to `TENANT`); it does NOT read `?as=` yet.
- `/app/register-unit` (`RegisterUnitView.vue`) is the unit-registration form,
  gated to a logged-in `UNIT_OWNER`.

## Decisions

- **Lessor path:** "List Your Unit" sends a visitor to **Unit Owner signup**
  (`/signup?as=LESSOR`). After the account is approved and they log in, they
  register the unit in the owner portal (My Units → Register Unit). This matches
  the existing account-approval flow; a public visitor cannot reach the gated
  register-unit form directly.
- **Lessee browse route:** the Featured Properties page lives at
  **`/available-units`** (a clear, user-facing name; the detail route stays
  `/units-for-lease/:id`).

## Routing

| Path | Component | Change |
| --- | --- | --- |
| `/` | `LandingView.vue` (new) | Role-selection hero only — no Featured Properties |
| `/available-units` | `AvailableUnitsView.vue` (repurposed) | Featured Properties grid + filters; hero removed |
| `/units-for-lease` | redirect → `/available-units` | Was redirect → `/` |
| `/units-for-lease/:id` | `UnitDetailPublicView.vue` | Unchanged route; "Back to Available Units" link → `/available-units` |
| `/signup` | `SignupView.vue` | Reads `?as=LESSOR`/`?as=LESSEE` to preselect the role |

## Components

- **`LandingView.vue` (new):** the hero + two choice cards, extracted from
  `AvailableUnitsView.vue`. It fetches **no** units and renders **no** Featured
  Properties. Uses `PublicShell` (with `ownsThemeToggle`). CTAs:
  - Lessee "Get Started" → `/available-units`
  - Lessor "List Your Unit" → `/signup?as=LESSOR`
- **`AvailableUnitsView.vue` (repurposed):** remove the `#hero` slot and the
  two choice cards; keep the Featured Properties grid, the estate/type filters,
  the loading/empty/error states, and the `publicUnits.list()` data flow. Add a
  page heading ("Available Units"). Stays a public page via `PublicShell`.
- **`SignupView.vue`:** on setup, if `route.query.as === "LESSOR"` set
  `role = "UNIT_OWNER"`; if `=== "LESSEE"` set `role = "TENANT"` (default stays
  `TENANT`). The role toggle remains user-editable.
- **Stray browse links → `/available-units`:** `InquiryStartView.vue`'s "Browse
  available units" link and `UnitDetailPublicView.vue`'s "Back to Available
  Units" link (both currently point at `/`).

## Flows

- **Lessee:** `/` → *Get Started* → `/available-units` → choose a unit →
  `/units-for-lease/:id` → *Inquire about this unit* (carries the unit id).
- **Lessor:** `/` → *List Your Unit* → `/signup?as=LESSOR` → account approved →
  log in → owner portal → *Register Unit*.

## Error / edge handling

- Landing page never calls the units API, so a listings outage cannot affect the
  role-selection entry point.
- `/available-units` keeps the existing loading, empty ("No units are available
  yet"), and error states unchanged.
- Deep links to `/units-for-lease` (legacy) still resolve, now to
  `/available-units`.
- An already-authenticated user visiting `/` still sees the landing page (public
  routes are not auth-gated); this is unchanged from today.

## Testing

- **Router:** `/` resolves to `LandingView`; `/available-units` resolves to
  `AvailableUnitsView`; `/units-for-lease` redirects to `/available-units`.
- **LandingView:** renders both choice cards; the Lessee CTA href is
  `/available-units`; the Lessor CTA href is `/signup?as=LESSOR`; it does NOT
  render a Featured Properties section and does NOT call `publicUnits.list()`.
- **AvailableUnitsView:** still renders the Featured Properties grid and filters
  from `publicUnits.list()` (existing test retargeted to the component/route),
  and no longer renders the role-selection choice cards.
- **SignupView:** mounting with `?as=LESSOR` preselects the Unit Owner role;
  `?as=LESSEE` (or none) preselects Lessee.

## Out of scope

- The authenticated tenant "Available Units" page (`/app/browse-units`).
- The inquiry / inquiry-unit-capture flow (unchanged).
- The unit detail route path (`/units-for-lease/:id`) — only its back-link and
  the list route change.
- No server or schema changes; this is client-only.
