# Quick Inquiry: role becomes a field on the form

**Date:** 2026-09-10
**Status:** Approved for planning

## Why

The landing-page work (`2026-09-09-landing-role-selection-design.md`) made `/`
a role-selection entry point: *I'm a Lessee* goes to `/available-units`, *I'm a
Lessor* goes to `/signup?as=LESSOR`. That change left the Quick Inquiry flow
inconsistent with the site around it in four ways.

1. **`/inquire` is orphaned.** It is the "I am a…" role picker for the inquiry
   flow, and the new landing page now asks the same question with the same
   lessor icon. Nothing in the application links to `/inquire` any more; it is
   reachable only by typing the URL.

2. **The two-step progress tracker is a fiction.** `InquiryShell` renders
   *1 Who you are → 2 Your inquiry*, but every real entry point — the site
   footer, the unit-detail nav link, and "Inquire about this unit" — jumps
   straight to `/inquiry?as=LESSEE`, which is step 2. Visitors always see a
   tracker whose first step never happened and cannot be revisited.

3. **Lessors lost their inquiry path.** All three entry points hardcode
   `?as=LESSEE`, and the landing sends lessors to signup instead. Yet
   `InquiryView` still carries the full lessor branch, the server still accepts
   lessor inquiries unauthenticated, and `shared/inquiryTypes.js` defines
   **twelve** lessor inquiry types against the lessee's eight — deliberately
   ordered by lease lifecycle, with Lease Renewal and Lease Pre-termination
   added specifically so they would stop falling into "General Inquiry" and
   could be reported on. The richer of the two option sets became unreachable
   from the UI while remaining valid on the server. This is an oversight of the
   landing-page change, not a decision.

4. **`/inquiry` without `?as=` redirects to `/`,** and the current "Change"
   control does `router.push("/")`. Both made sense when `/` was where an
   inquirer chose their role. `/` now answers *browse or sign up* — a different
   question — so sending an inquirer there drops them out of the flow and
   offers two actions, neither of which is "change my role".

## What we are building

The role stops being a value frozen in the URL and becomes a field on the
inquiry form, changeable in place. `/inquire` and the two-step tracker are
deleted. Lessors regain an inquiry path.

### Routes

- Delete the `/inquire` route, `client/src/views/InquiryStartView.vue`, and
  `client/tests/InquiryStartView.test.js`.
- Keep `/inquiry`. Remove its redirect to `/` when `?as=` is absent — an unset
  role is now a valid starting state, not an error.

### `InquiryShell.vue`

Drop the `step` prop and the `<ol class="steps">` markup. With
`InquiryStartView` gone, `InquiryView` is the only consumer and there is no
second step to track. The eyebrow, title, lede and card frame are unchanged.

### `InquiryView.vue` — the role control

Replace the current `.asrole` strip (`Inquiring as <strong>X</strong>` plus a
*Change* link that navigates to `/`) with a control that keeps the same
reassurance but resolves the change on the page:

- **A role is set** (`?as=LESSOR` or `?as=LESSEE`): the strip renders
  collapsed, reading `Inquiring as Lessor (Unit Owner)` with a *Change*
  button. Pressing *Change* reveals the two choices inline. Choosing one
  collapses the strip again.
- **No role is set** (bare `/inquiry`, or an invalid `?as=` value): the two
  choices render expanded from the start. There is nothing to change from yet,
  so no collapsed strip and no *Change* button.

The expanded choice reuses the existing `.seg` segmented-control pattern
already used by the Category field, so it introduces no new visual language.
Both roles are visible at once when expanded — this is not a dropdown menu,
and no overlay, focus trap or outside-click handling is introduced:

```
collapsed (arrived with ?as=LESSOR)
  Inquiring as  Lessor (Unit Owner)              [ Change ]

expanded (after pressing Change)
  I am a:  [ Lessor (Unit Owner) ✓ ][ Lessee (Prospective Tenant) ]

collapsed again (after picking Lessee)
  Inquiring as  Lessee (Prospective Tenant)      [ Change ]
```

The labels come from `INQUIRER_LABEL` in `shared/inquiryTypes.js`, so the
collapsed strip and the two buttons always name the roles identically.

Two behaviours already present in the file carry the rest without
modification, and must be preserved rather than rewritten:

- `canSubmit` already requires `form.inquirerType`, so an unchosen role blocks
  submission with no new validation.
- The existing `watch` on `form.inquirerType` already clears `form.inquiryType`
  when the role changes. It was effectively dead code while the role came from
  the URL; it is now what keeps the dependent dropdown honest when a visitor
  switches. The twelve lessor options and eight lessee options do not overlap
  cleanly, so a stale selection must not survive a switch.

`INQUIRY_TYPES[form.inquirerType]` continues to drive the Inquiry type
dropdown. `shared/inquiryTypes.js` is not modified.

### Entry points

| Link | Now | After |
| --- | --- | --- |
| `PublicShell` footer CTA | `/inquiry?as=LESSEE` | `/inquiry` |
| Unit detail nav "Make an inquiry" | `/inquiry?as=LESSEE` | `/inquiry` |
| Unit detail "Inquire about this unit" | `/inquiry?as=LESSEE&unit=…` | unchanged |
| `LandingView` | — | add one quiet line under the two cards → `/inquiry` |

The unit-detail CTA keeps its preset because there the role genuinely is known:
someone acting on a specific listing is a prospective tenant. The footer and
nav links are site-wide and must serve both roles, so they carry no preset. The
landing line is deliberately restrained — a single sentence under the cards,
not a third card competing with the two primary choices.

## Testing

Removed:

- `client/tests/InquiryStartView.test.js` — the component is deleted.
- The `["inquiry step 1", InquiryStartView, "/inquire"]` row in
  `client/tests/publicShellAlignment.test.js`.

Updated:

- `client/tests/router.test.js` — `/inquire` no longer resolves to a component.
- `client/tests/LandingView.test.js` — the landing offers an inquiry link.
- `client/tests/PublicShellFooter.test.js` — the footer CTA is role-neutral.
- `client/tests/UnitDetailPublicView.test.js` — the nav link is role-neutral
  while the unit CTA keeps `?as=LESSEE&unit=…`.

New, in `client/tests/InquiryView.test.js`:

- `?as=LESSOR` and `?as=LESSEE` preselect the role and render the collapsed
  strip.
- A bare `/inquiry` renders the choice expanded and does **not** redirect.
- An invalid `?as=` value is treated as unset rather than accepted.
- *Change* reveals the choices; picking a role collapses the strip again.
- Switching the role clears a previously chosen Inquiry type.
- Choosing Lessor offers all twelve lessor inquiry types; Lessee offers eight.
- Submit stays blocked until a role is chosen.

## Out of scope

- `shared/inquiryTypes.js` and the server's inquiry validation are unchanged.
- The officer-facing Inquiries module is unchanged.
- The landing page's two primary cards, and the signup `?as=LESSOR` preselect,
  are unchanged.
- No visual redesign of the inquiry form beyond the role control.
