# Inline Role Switching on the Inquiry Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Inquiry page, "Change" reveals a segmented Lessee | Lessor toggle inline (no navigation to the front page); a direct `/inquiry` visit shows the picker instead of redirecting; unit context stays lessee-only; and `/inquire` redirects to `/inquiry`.

**Architecture:** All in `InquiryView.vue` — add a `showPicker` state and a `chooseRole()` action, swap the navigating "Change" link for an inline segmented toggle (reusing the existing `.seg`/`.seg__opt` styles), and gate the unit banner + `unitId` payload on the LESSEE role. One router change redirects the now-redundant `/inquire`.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, Vitest + @vue/test-utils.

## Global Constraints

- Client-only — no server, API, or inquiry-schema change (LESSEE and LESSOR inquiries both stay supported).
- "Change" must NOT navigate; it reveals the role choices inline on `/inquiry`.
- Picker is a segmented toggle (Lessee | Lessor) reusing `.seg` / `.seg__opt`.
- A direct `/inquiry` visit with no `?as=` shows the picker (no redirect to `/`).
- Unit context is lessee-only: the banner shows and `unitId` is sent only when `form.inquirerType === "LESSEE"`.
- `/inquire` redirects to `/inquiry`.

---

### Task 1: Inline role toggle on InquiryView (no navigation on Change)

**Files:**
- Modify: `client/src/views/InquiryView.vue`
- Test: `client/tests/InquiryView.test.js`

**Interfaces:**
- Produces: `InquiryView` renders a `.rolepick` segmented toggle (two `.seg__opt` buttons, "Lessee" / "Lessor") when its `showPicker` state is on; "Change" turns it on without navigating; `chooseRole(role)` sets the role, hides the picker, and clears `unitContext` for non-LESSEE.

- [ ] **Step 1: Write the failing tests**

In `client/tests/InquiryView.test.js`, add a no-role mount helper after `mountWithUnit` (before the `describe`):

```js
async function mountNoRole() {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push({ path: "/" }); // no ?as=
  await router.isReady();
  return mount(InquiryView, { global: { plugins: [router] } });
}
```

Then add these tests inside the `describe("InquiryView (Quick Inquiry form)", …)` block:

```js
  it("Change reveals the inline role toggle instead of navigating away", async () => {
    const w = await mountView("LESSEE");
    expect(w.find(".rolepick").exists()).toBe(false); // pill shown, not the picker
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    expect(w.find(".rolepick").exists()).toBe(true);
    const roleBtns = w.findAll(".rolepick .seg__opt").map((b) => b.text());
    expect(roleBtns.some((t) => t.includes("Lessee"))).toBe(true);
    expect(roleBtns.some((t) => t.includes("Lessor"))).toBe(true);
  });

  it("picking a role in the toggle switches the type options and keeps entries", async () => {
    const w = await mountView("LESSEE");
    await w.find("#fullName").setValue("Maria Santos");
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    await w.findAll(".rolepick .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    // Picker closes, the LESSOR type options are now in effect, and the typed name survives.
    expect(w.find(".rolepick").exists()).toBe(false);
    const opts = w.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(opts).toContain("Find a Tenant");
    expect(w.find("#fullName").element.value).toBe("Maria Santos");
  });

  it("shows the role picker on a direct visit with no ?as= (no redirect)", async () => {
    const w = await mountNoRole();
    expect(w.find(".rolepick").exists()).toBe(true);
  });

  it("switching to Lessor drops the unit banner and omits unitId on submit", async () => {
    const w = await mountWithUnit();
    expect(w.text()).toContain("12A"); // lessee unit banner
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    await w.findAll(".rolepick .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.text()).not.toContain("12A"); // banner gone for lessor
    // Complete + submit; category is still RESIDENCES from the unit prefill.
    await w.find("#fullName").setValue("Ana Reyes");
    await w.find("#email").setValue("ana@example.com");
    await w.find("#inquiryType").setValue("Find a Tenant");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    const arg = createInquiry.mock.calls.at(-1)[0];
    expect(arg.inquirerType).toBe("LESSOR");
    expect(arg.unitId).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace client run test -- InquiryView`
Expected: FAIL — no `.rolepick` element; `mountNoRole` redirects (`onMounted` calls `router.replace("/")`); the unit-switch test still sends `unitId`.

- [ ] **Step 3: Update the script setup**

In `client/src/views/InquiryView.vue`, change the router import (line 3) from:

```js
import { useRouter, useRoute } from "vue-router";
```

to (the navigating uses are being removed):

```js
import { useRoute } from "vue-router";
```

Remove the `const router = useRouter();` line (line 14). Add a `showPicker` ref next to the other refs (after `const unitContext = ref(null);`):

```js
const showPicker = ref(false);
```

Replace the `onMounted(async () => { … })` block (lines 21-27) with:

```js
onMounted(async () => {
  // No role carried in? Let the user pick one on this page (don't bounce home).
  if (!selectedType) showPicker.value = true;
  if (unitId) {
    form.category = "RESIDENCES"; // sensible default for the residential catalog; user can change
    try { unitContext.value = await publicUnits.get(unitId); } catch { unitContext.value = null; }
  }
});
```

Add a `chooseRole` function after the `submit` function (before `</script>`):

```js
function chooseRole(role) {
  form.inquirerType = role;
  if (role !== "LESSEE") unitContext.value = null; // unit context is a lessee concept
  showPicker.value = false;
}
```

- [ ] **Step 4: Update the template — picker vs pill, and gate the unit banner**

In `client/src/views/InquiryView.vue`, gate the unit banner on the LESSEE role. Change (lines 82-88):

```html
        <p v-if="unitContext" class="unit-context">
```

to:

```html
        <p v-if="unitContext && form.inquirerType === 'LESSEE'" class="unit-context">
```

Replace the whole `.asrole` block (lines 90-93):

```html
        <div class="asrole">
          <span>Inquiring as <strong>{{ INQUIRER_LABEL[form.inquirerType] }}</strong></span>
          <a href="#" @click.prevent="router.push('/')">Change</a>
        </div>
```

with the picker-or-pill:

```html
        <div v-if="showPicker" class="rolepick">
          <span class="label">I am a…</span>
          <div class="seg" role="group" aria-label="I am a">
            <button type="button" class="seg__opt" :class="{ on: form.inquirerType === 'LESSEE' }" :aria-pressed="form.inquirerType === 'LESSEE'" @click="chooseRole('LESSEE')">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="M9.5 21v-5h5v5"/><path d="M9 11h.01M15 11h.01"/></svg>
              Lessee
            </button>
            <button type="button" class="seg__opt" :class="{ on: form.inquirerType === 'LESSOR' }" :aria-pressed="form.inquirerType === 'LESSOR'" @click="chooseRole('LESSOR')">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14"/><path d="M10 9h4M10 13h4M10 17h4"/></svg>
              Lessor
            </button>
          </div>
        </div>
        <div v-else class="asrole">
          <span>Inquiring as <strong>{{ INQUIRER_LABEL[form.inquirerType] }}</strong></span>
          <a href="#" @click.prevent="showPicker = true">Change</a>
        </div>
```

- [ ] **Step 5: Gate the `unitId` payload on the LESSEE role**

In the `submit` function, change (line 54):

```js
    if (unitId) payload.unitId = unitId;
```

to:

```js
    if (unitId && form.inquirerType === "LESSEE") payload.unitId = unitId;
```

- [ ] **Step 6: Add a scoped style for the picker label spacing**

In the `<style scoped>` block, add after the `.asrole a { … }` rule:

```css
.rolepick { display: flex; flex-direction: column; gap: 0.3rem; }
.rolepick .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: var(--muted); }
```

(The `.seg` / `.seg__opt` styles already exist and are reused.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm --workspace client run test -- InquiryView`
Expected: PASS (the four new tests, plus the existing InquiryView tests — the default view still shows the "Inquiring as …" pill and no `#inquirerType` select).

- [ ] **Step 8: Commit**

```bash
git add client/src/views/InquiryView.vue client/tests/InquiryView.test.js
git commit -m "feat(inquiry): inline Lessee|Lessor role toggle on Change (no navigation)"
```

---

### Task 2: Redirect `/inquire` to `/inquiry`

**Files:**
- Modify: `client/src/router/index.js`
- Test: `client/tests/router.test.js`

**Interfaces:**
- Consumes: the inline picker on `/inquiry` (Task 1) — `/inquire` no longer needs its own role-picker page.
- Produces: `/inquire` redirects to `/inquiry`.

- [ ] **Step 1: Update the failing test**

In `client/tests/router.test.js`, remove the `/inquire` → `InquiryStartView` assertion from the first test and add a redirect test. Change the first test's body so it no longer references `/inquire`:

```js
  it("serves the landing page at /, available units at /available-units, and the Inquiry form at /inquiry", () => {
    expect(router.resolve("/").matched[0].components.default).toBe(LandingView);
    expect(router.resolve("/available-units").matched[0].components.default).toBe(AvailableUnitsView);
    expect(router.resolve("/inquiry").matched[0].components.default).toBe(InquiryView);
  });
```

Add a new test after it:

```js
  it("redirects the old /inquire role-picker path to /inquiry", async () => {
    await router.push("/inquire");
    expect(router.currentRoute.value.path).toBe("/inquiry");
  });
```

Then remove the now-unused `InquiryStartView` import at the top of `client/tests/router.test.js`:

```js
import InquiryStartView from "../src/views/InquiryStartView.vue";
```

(delete that line).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- router`
Expected: FAIL — `/inquire` currently resolves to `InquiryStartView`, so `currentRoute.path` is `/inquire`, not `/inquiry`.

- [ ] **Step 3: Change the route to a redirect**

In `client/src/router/index.js`, change the `/inquire` route:

```js
  { path: "/inquire", component: InquiryStartView, meta: { ownsThemeToggle: true } }, // "I am a…" user-type selection
```

to:

```js
  { path: "/inquire", redirect: "/inquiry" }, // role picking now lives inline on /inquiry
```

Then remove the now-unused `InquiryStartView` import from `client/src/router/index.js`:

```js
import InquiryStartView from "../views/InquiryStartView.vue";
```

(delete that line).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace client run test -- router`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/router/index.js client/tests/router.test.js
git commit -m "feat(router): redirect /inquire to /inquiry (role picking moved inline)"
```

---

## Final verification

- [ ] Run the full client suite: `npm --workspace client run test` — all green.
- [ ] Rebuild so `:5050` serves it: `npm --workspace client run build`.
- [ ] Manual smoke (dev server on :5050, hard refresh): from a listing, click "Inquire about this unit" → the form shows "Inquiring as Lessee" + the unit banner; click **Change** → the Lessee | Lessor toggle appears **on the page** (no jump to the front page); pick **Lessor** → the banner disappears and the inquiry-type options switch to the lessor set; visiting `/inquire` lands on `/inquiry` showing the picker.

## Deployment note

Client-only change — no migration; serving the rebuilt client bundle is all that's needed.

## Out of scope

- Removing `InquiryStartView.vue` from the repo (left unused; no dangling imports since both the router and its test drop the import).
