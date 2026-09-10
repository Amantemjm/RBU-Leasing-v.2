# Inline Role Switching on the Inquiry Page — Design

**Date:** 2026-09-10
**Status:** Approved (design)

## Goal

Make the Quick Inquiry page self-contained for role selection. Today its
"Change" link navigates back to the front page (`/`), which — after the landing
page became a role-selection entry point — is the wrong destination and breaks
the flow. Instead, "Change" should reveal the role choices **inline on the
Inquiry page** (a segmented Lessee / Lessor toggle), letting the user switch
without leaving the page. A direct visit with no role should also be handled on
the page rather than bounced to `/`.

## Background (current behavior)

`client/src/views/InquiryView.vue` (`/inquiry`):

- Reads the role from `?as=LESSEE|LESSOR` into `selectedType`; `onMounted`
  **redirects to `/`** when there is no valid role.
- Renders an `.asrole` pill — *"Inquiring as **Lessee** · Change"* — whose
  **Change** link does `router.push('/')`.
- `form.inquirerType` drives the inquiry-type `<select>` options
  (`INQUIRY_TYPES[inquirerType]`); a `watch` clears `inquiryType` when the role
  changes.
- A lessee arriving from a unit page carries `?unit=<id>`, shows a unit-context
  banner, and sends `unitId` on submit (the inquiry-unit-capture feature).

Entry points into `/inquiry` today: the header/footer **"Make an inquiry"**
(`?as=LESSEE`) and a unit's **"Inquire about this unit"** (`?as=LESSEE&unit=…`).
The standalone role picker `/inquire` (`InquiryStartView.vue`) is no longer
linked from anywhere.

## Decisions

- **Both roles stay.** The inquiry keeps supporting LESSEE and LESSOR; "Change"
  switches between them. No backend change.
- **Picker style:** a compact **segmented toggle** (Lessee | Lessor), reusing
  the existing `.seg` / `.seg__opt` styles already used for the category choice,
  shown where the `.asrole` pill sits.
- **`/inquire` is redundant** and redirects to `/inquiry`.

## Behavior

1. **Arriving with a role** (`?as=LESSEE` / `?as=LESSOR`, incl. the unit link):
   the form opens on that role and shows the `.asrole` pill with **Change**.
2. **Change** sets `showPicker = true` and reveals the segmented Lessee | Lessor
   toggle in place of the pill — **no navigation**. Selecting a role sets
   `form.inquirerType`, hides the picker, and refreshes the inquiry-type
   options. Already-entered fields (name, email, message) are preserved.
3. **Arriving with no role** (`/inquiry` with no `?as=`, e.g. via the
   `/inquire` redirect): instead of redirecting to `/`, the page opens with
   `showPicker = true` so the user chooses a role on the page, then completes
   the form.
4. **Unit context is lessee-only.** The unit banner shows only while the role is
   LESSEE, and `unitId` is sent only when the role is LESSEE. Switching to
   LESSOR hides the banner and drops `unitId` from the payload (the `unitId`
   value itself is untouched, so switching back to LESSEE restores it).

## Implementation

**`client/src/views/InquiryView.vue`**
- Add `const showPicker = ref(false)`.
- `onMounted`: replace the `if (!selectedType) router.replace("/")` early return
  with `if (!selectedType) showPicker.value = true;` (keep the `unitId` fetch).
- `.asrole` **Change** handler → `showPicker = true` (remove `router.push('/')`).
- Add a `chooseRole(role)` function: `form.inquirerType = role; if (role !==
  "LESSEE") unitContext.value = null; showPicker.value = false;`.
- Template: when `showPicker` is true, render the segmented role toggle
  (two `.seg__opt` buttons, "Lessee" / "Lessor", `on` when
  `form.inquirerType === …`, `@click="chooseRole(…)"`) instead of the `.asrole`
  pill; otherwise render the pill as today.
- Unit banner: gate on `unitContext && form.inquirerType === 'LESSEE'`.
- Submit payload: send `unitId` only when `form.inquirerType === 'LESSEE'`.
- `router` is still used (nothing else depends on the removed push); keep the
  import if other uses remain, otherwise drop it.

**`client/src/router/index.js`**
- Change the `/inquire` route to a redirect: `{ path: "/inquire", redirect:
  "/inquiry" }` (was `InquiryStartView`). `InquiryStartView.vue` is left in the
  repo unused (no dangling imports); its removal is out of scope.

## Error / edge handling

- No valid `?as=` → picker shown (no redirect); the form cannot submit until a
  role and the required fields are set (`canSubmit` already requires
  `inquirerType`).
- Switching roles clears `inquiryType` (existing `watch`), so a stale
  role-specific type cannot be submitted.
- Switching to LESSOR after arriving from a unit drops the unit banner and
  `unitId`; switching back to LESSEE restores both.

## Testing (client, Vitest)

- **Change reveals the inline picker without navigating:** mount with
  `?as=LESSEE`, click Change → the segmented role toggle renders and the route
  is still `/inquiry` (no push to `/`).
- **Selecting a role updates the form and keeps entries:** type a name, click
  Change, pick Lessor → `inquirerType` is LESSOR, the inquiry-type options are
  the LESSOR set, and the typed name is still present.
- **Direct visit with no role shows the picker:** mount at `/inquiry` (no
  `?as=`) → the role toggle is shown and there is no redirect to `/`.
- **Unit context is lessee-only:** mount with `?as=LESSEE&unit=u1` (mock
  `publicUnits.get`) → banner shows; after switching to Lessor → banner gone and
  a submitted payload omits `unitId`.
- **`/inquire` redirects to `/inquiry`:** `router.push('/inquire')` resolves to
  `/inquiry`.

## Out of scope

- Removing `InquiryStartView.vue` from the repo (leave it unused).
- Any backend / inquiry-schema change (LESSEE and LESSOR inquiries unchanged).
- The header/footer "Make an inquiry" links and the unit "Inquire about this
  unit" link (unchanged — they still land on `/inquiry`).
