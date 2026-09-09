# Quick Inquiry Role Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the inquirer's role a field on the Quick Inquiry form that can be changed in place, delete the orphaned `/inquire` role picker and its false two-step tracker, and give lessors a working inquiry path again.

**Architecture:** `InquiryView.vue` gains a small piece of local state (`roleOpen`) that decides whether the role renders as a collapsed confirmation strip or as an open two-button choice. The role value itself already lives in `form.inquirerType`; `?as=` stops being the only way to set it and becomes merely a preselect. Two behaviours already in the file — `canSubmit` requiring `inquirerType`, and the `watch` that clears `inquiryType` on role change — become load-bearing and must be preserved, not rewritten. Once the role is switchable on the form, `/inquire` and `InquiryShell`'s step tracker have no job and are deleted.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, Vitest + @vue/test-utils + happy-dom.

**Spec:** `docs/superpowers/specs/2026-09-10-quick-inquiry-role-field-design.md`

## Global Constraints

- Run all client commands from `client/`. Test: `npm test`. Single file: `npx vitest run tests/<file> --reporter=verbose`.
- **Never `git add -A`, `git add .`, or `git add <directory>`.** Stage only the exact files each step names. The working tree holds unrelated untracked files (`docs/role-playbook.html`, `docs/RBU-Leasing-Walkthrough.docx`, `server/.gitignore`) that must never be committed.
- `shared/inquiryTypes.js` is not modified by any task. It is the single source of truth for both the server and the client; the twelve lessor and eight lessee inquiry types come from it.
- All colors come from existing CSS custom properties (`--accent`, `--accent-050`, `--accent-text`, `--muted`, `--line-strong`, `--surface`, `--ink-700`, `--radius-sm`). Do not introduce literal hex values — the theme has a light and a dark path and a literal only works in one.
- Role labels always come from `INQUIRER_LABEL` so the collapsed strip and the buttons cannot drift apart: `LESSOR` → "Lessor (Unit Owner)", `LESSEE` → "Lessee (Prospective Tenant)".

---

### Task 1: The role becomes a switchable field on the inquiry form

**Files:**
- Modify: `client/src/views/InquiryView.vue`
- Test: `client/tests/InquiryView.test.js`

**Interfaces:**
- Consumes: `INQUIRER_TYPES`, `INQUIRER_LABEL`, `INQUIRY_TYPES` re-exported from `client/src/lib/inquiryOptions.js`.
- Produces: CSS hooks the later tasks and tests rely on — `.asrole` (collapsed strip), `.asrole__change` (the Change button), `.seg--role` (the open choice, wrapping buttons that keep the shared `.seg__opt` class).

**Why the selectors matter:** the Category field already uses `.seg__opt`, and existing tests locate it with `findAll(".seg__opt").find(b => b.text().includes("Residences"))`. Scoping role buttons under `.seg--role` keeps both sets addressable without ambiguity.

- [ ] **Step 1: Replace the contradicting test and add the new behaviour tests**

`client/tests/InquiryView.test.js` currently contains a test named `"has no 'I am a' field and reflects the carried-over user type"` which asserts `w.find("#inquirerType").exists()` is `false`. That test describes the behaviour we are removing. **Delete that single test and put the new ones in its place — do not leave it alongside the new tests, and do not overwrite the whole file**, which would destroy the five other tests it holds.

First, replace the `mountView` helper (it currently always sends `?as=`) so a bare `/inquiry` can be mounted:

```js
// The role may arrive from a unit page or the landing as ?as=…, or not at all.
// Passing null mounts the bare /inquiry route, which is now a valid entry.
async function mountView(as = "LESSEE") {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push(as ? { path: "/", query: { as } } : { path: "/" });
  await router.isReady();
  return mount(InquiryView, { global: { plugins: [router] } });
}
```

Then delete the `"has no 'I am a' field…"` test and insert these in its place:

```js
  it("preselects the role from ?as= and collapses it to a confirmation", async () => {
    const w = await mountView("LESSOR");
    expect(w.find(".asrole").exists()).toBe(true);
    expect(w.text()).toContain("Inquiring as");
    expect(w.text()).toContain("Lessor (Unit Owner)");
    expect(w.find(".seg--role").exists()).toBe(false);
  });

  // A bare /inquiry used to redirect to "/", which now asks a different
  // question (browse or sign up) and drops the visitor out of the flow.
  it("opens the role choice and does not redirect when no role is carried over", async () => {
    const w = await mountView(null);
    expect(w.find(".seg--role").exists()).toBe(true);
    expect(w.find(".asrole").exists()).toBe(false);
    expect(w.find("form").exists()).toBe(true);
  });

  it("treats an unknown ?as= value as no role at all", async () => {
    const w = await mountView("ADMIN");
    expect(w.find(".seg--role").exists()).toBe(true);
    expect(w.find(".asrole").exists()).toBe(false);
  });

  it("Change reopens the choice, and picking a role collapses it again", async () => {
    const w = await mountView("LESSEE");
    await w.find(".asrole__change").trigger("click");
    expect(w.find(".seg--role").exists()).toBe(true);
    const lessor = w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor"));
    await lessor.trigger("click");
    expect(w.find(".seg--role").exists()).toBe(false);
    expect(w.text()).toContain("Lessor (Unit Owner)");
  });

  // The twelve lessor types and eight lessee types do not overlap cleanly, so
  // a selection made under one role must not survive a switch to the other.
  it("swaps the inquiry types and clears a stale selection when the role changes", async () => {
    const w = await mountView("LESSEE");
    await w.find("#inquiryType").setValue("Unit Availability");
    expect(w.find("#inquiryType").element.value).toBe("Unit Availability");
    await w.find(".asrole__change").trigger("click");
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.find("#inquiryType").element.value).toBe("");
    const opts = w.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(opts).toContain("Find a Tenant");
    expect(opts).not.toContain("Unit Availability");
  });

  // Guards the option sets the spec depends on: the lessor branch is the
  // richer of the two and was unreachable from the UI before this change.
  it("offers all twelve lessor inquiry types and the eight lessee ones", async () => {
    const lessor = await mountView("LESSOR");
    expect(lessor.find("#inquiryType").findAll("option").length).toBe(13); // 12 + the disabled placeholder
    const lessee = await mountView("LESSEE");
    expect(lessee.find("#inquiryType").findAll("option").length).toBe(9); // 8 + the disabled placeholder
  });

  it("keeps submit disabled until a role is chosen", async () => {
    const w = await mountView(null);
    await w.findAll(".seg__opt").find((b) => b.text().includes("Residences")).trigger("click");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    await w.find('input[type="checkbox"]').setValue(true);
    expect(w.find('button[type="submit"]').attributes("disabled")).toBeDefined();
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessee")).trigger("click");
    await w.find("#inquiryType").setValue("Unit Availability");
    expect(w.find('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/InquiryView.test.js --reporter=verbose`

Expected: FAIL. The new tests error because `.asrole__change` and `.seg--role` do not exist yet, and `mountView(null)` currently triggers the `router.replace("/")` redirect.

- [ ] **Step 3: Import the role list and add the open/closed state**

In `client/src/views/InquiryView.vue`, extend the existing import on line 6:

```js
import { INQUIRER_TYPES, INQUIRER_LABEL, INQUIRY_TYPES } from "../lib/inquiryOptions.js";
```

Delete the redirect line from `onMounted` — it currently reads:

```js
  if (!selectedType) { router.replace("/"); return; }
```

Leaving `onMounted` as:

```js
onMounted(async () => {
  if (unitId) {
    form.category = "RESIDENCES"; // sensible default for the residential catalog; user can change
    try { unitContext.value = await publicUnits.get(unitId); } catch { unitContext.value = null; }
  }
});
```

Add after the `watch` on `form.inquirerType` (around line 37):

```js
// Who is inquiring is a field on this form, not a value frozen in the URL.
// It starts collapsed when we already know it — most visitors arrive from a
// unit page or the landing with the role settled — and open when we don't, so
// a bare /inquiry is a valid starting state rather than a redirect.
const roleOpen = ref(!selectedType);
function chooseRole(type) {
  form.inquirerType = type;
  roleOpen.value = false;
}
```

- [ ] **Step 4: Remove the now-dead router import**

Both uses of `router` in this file are being deleted — the `onMounted` redirect in Step 3 and the `Change` link in Step 5. Remove the declaration and trim the import so nothing unused is left behind:

```js
import { useRoute } from "vue-router";
```

and delete the line `const router = useRouter();`. Keep `const route = useRoute();` — `route.query` still supplies `as` and `unit`.

- [ ] **Step 5: Replace the role strip in the template**

In `client/src/views/InquiryView.vue`, replace this block (currently around lines 90-93):

```html
        <div class="asrole">
          <span>Inquiring as <strong>{{ INQUIRER_LABEL[form.inquirerType] }}</strong></span>
          <a href="#" @click.prevent="router.push('/')">Change</a>
        </div>
```

with:

```html
        <!-- Who is inquiring. Collapsed to a confirmation once we know, since
             most visitors arrive with the role already settled; Change reopens
             it here rather than sending them to "/", which now asks a
             different question (browse or sign up). -->
        <div v-if="!roleOpen" class="asrole">
          <span>Inquiring as <strong>{{ INQUIRER_LABEL[form.inquirerType] }}</strong></span>
          <button type="button" class="asrole__change" @click="roleOpen = true">Change</button>
        </div>
        <div v-else class="field">
          <span class="label">I am a <span class="req">*</span></span>
          <div class="seg seg--role" role="group" aria-label="Who is inquiring">
            <button
              v-for="t in INQUIRER_TYPES"
              :key="t"
              type="button"
              class="seg__opt"
              :class="{ on: form.inquirerType === t }"
              :aria-pressed="form.inquirerType === t"
              @click="chooseRole(t)"
            >{{ INQUIRER_LABEL[t] }}</button>
          </div>
        </div>
```

- [ ] **Step 6: Restyle Change as a button**

In the `<style scoped>` block of `client/src/views/InquiryView.vue`, replace the rule on line 170:

```css
.asrole a { color: var(--accent-text); font-weight: 600; font-size: 0.8rem; text-decoration: underline; }
```

with:

```css
.asrole__change {
  background: none; border: none; padding: 0; font: inherit; font-size: 0.8rem; font-weight: 600;
  color: var(--accent-text); text-decoration: underline; cursor: pointer;
}
```

And add directly beneath the existing `.seg__opt:active` rule (around line 192):

```css
/* The role labels are longer than "Residences"/"Offices", so they stack on
   narrow screens rather than truncating. */
.seg--role .seg__opt { font-size: 0.88rem; }
@media (max-width: 620px) { .seg--role { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/InquiryView.test.js --reporter=verbose`

Expected: PASS, 11 tests (the 5 pre-existing ones plus the 6 new; the contradicting one was replaced).

- [ ] **Step 8: Commit**

```bash
git add client/src/views/InquiryView.vue client/tests/InquiryView.test.js
git commit -m "feat(inquiry): make the inquirer role a field on the form

Change now reopens the role choice in place instead of pushing to \"/\",
which after the landing-page change asks a different question. A bare
/inquiry no longer redirects — it opens with the choice visible."
```

---

### Task 2: Retire /inquire and the two-step tracker

**Files:**
- Delete: `client/src/views/InquiryStartView.vue`, `client/tests/InquiryStartView.test.js`
- Modify: `client/src/router/index.js:4,56`, `client/src/views/InquiryShell.vue`, `client/src/views/InquiryView.vue:68`
- Test: `client/tests/router.test.js`, `client/tests/publicShellAlignment.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 — but it must run after it, because deleting `/inquire` before the form can set its own role would leave lessors with no way to pick a role at all.
- Produces: `InquiryShell` with no `step` prop. Any consumer passing `:step` would then be passing an undeclared prop.

- [ ] **Step 1: Write the failing tests**

In `client/tests/router.test.js`, remove the import on line 4 (`import InquiryStartView from "../src/views/InquiryStartView.vue";`) and replace the assertion on line 16:

```js
    expect(router.resolve("/inquire").matched[0].components.default).toBe(InquiryStartView);
```

with:

```js
    // /inquire was the "I am a…" picker. The landing page asks that question
    // now, and the form itself owns the role, so the route is gone.
    expect(router.resolve("/inquire").matched.length).toBe(0);
```

In `client/tests/publicShellAlignment.test.js`, remove the import on line 30 (`import InquiryStartView from "../src/views/InquiryStartView.vue";`) and delete this row from the `PAGES` array on line 72:

```js
  ["inquiry step 1", InquiryStartView, "/inquire"],
```

Then rename the remaining inquiry row on the next line from `"inquiry step 2"` to `"inquiry"`, since there are no longer steps:

```js
  ["inquiry", InquiryView, "/inquiry?as=LESSEE"],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/router.test.js --reporter=verbose`

Expected: FAIL — `/inquire` still resolves to a component, so `matched.length` is 1, not 0.

- [ ] **Step 3: Delete the route and the component**

In `client/src/router/index.js`, delete the import on line 4:

```js
import InquiryStartView from "../views/InquiryStartView.vue";
```

and the route on line 56:

```js
  { path: "/inquire", component: InquiryStartView, meta: { ownsThemeToggle: true } }, // "I am a…" user-type selection
```

Then delete the two files:

```bash
git rm client/src/views/InquiryStartView.vue client/tests/InquiryStartView.test.js
```

- [ ] **Step 4: Remove the step tracker from the shell**

In `client/src/views/InquiryShell.vue`, delete the `step` entry from `defineProps`, leaving:

```js
defineProps({
  lede: { type: String, default: "" },
});
```

Delete the tracker markup from the template:

```html
      <ol class="steps" aria-label="Progress">
        <li :class="{ on: step >= 1, done: step > 1 }"><span class="steps__dot">1</span>Who you are</li>
        <li class="steps__bar" aria-hidden="true"></li>
        <li :class="{ on: step >= 2 }"><span class="steps__dot">2</span>Your inquiry</li>
      </ol>
```

Delete the `.steps` rules from the `<style scoped>` block — every rule whose selector begins `.steps` (currently lines 58-68), and the `.steps__bar { flex-basis: 18px; }` line inside the media query near line 82. Leave the surrounding media query itself in place if it still contains other rules; delete it only if that line was its only content.

Update the file's opening comment, which still describes a two-step flow:

```js
// Shared frame for the public Quick Inquiry form.
```

- [ ] **Step 5: Stop passing the removed prop**

In `client/src/views/InquiryView.vue` line 68, change:

```html
  <InquiryShell :step="2" lede="A few quick details and our leasing team will get in touch — usually within one business day.">
```

to:

```html
  <InquiryShell lede="A few quick details and our leasing team will get in touch — usually within one business day.">
```

- [ ] **Step 6: Run the full client suite**

Run: `npm test`

Expected: PASS. `InquiryStartView.test.js` is gone, so the file count drops by one from the current 58.

- [ ] **Step 7: Commit**

```bash
git add client/src/router/index.js client/src/views/InquiryShell.vue client/src/views/InquiryView.vue client/tests/router.test.js client/tests/publicShellAlignment.test.js
git commit -m "refactor(inquiry): delete /inquire and the two-step tracker

The landing page asks the role question now and the form owns the role,
so the picker was unlinked and the tracker described a step no entry
point visited."
```

---

### Task 3: Role-neutral entry points and a landing inquiry link

**Files:**
- Modify: `client/src/components/PublicShell.vue:87`, `client/src/views/UnitDetailPublicView.vue:67`, `client/src/views/LandingView.vue`
- Test: `client/tests/PublicShellFooter.test.js`, `client/tests/UnitDetailPublicView.test.js`, `client/tests/LandingView.test.js`

**Interfaces:**
- Consumes: `/inquiry` accepting no `?as=` — delivered by Task 1. Doing this task first would send visitors to a route that redirects them away.

- [ ] **Step 1: Write the failing tests**

Add to `client/tests/PublicShellFooter.test.js`, inside the existing `describe` block:

```js
  // The footer appears on every public page, so it cannot presume a role.
  it("points the footer inquiry CTA at the role-neutral inquiry route", () => {
    const w = mount(PublicShell, { global: { stubs } });
    expect(w.find(".foot__cta").attributes("href")).toBe("/inquiry");
  });
```

Add to `client/tests/UnitDetailPublicView.test.js`, inside the existing `describe` block. That file has no shared mount helper — each test mounts inline, and `vue-router` is mocked at the top of the file — so mirror the neighbouring `"points the inquire CTA at the unit-specific inquiry route"` test exactly:

```js
  it("keeps the nav inquiry link role-neutral while the unit CTA stays lessee-specific", async () => {
    const stubs = { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } };
    const w = mount(UnitDetailPublicView, { global: { stubs } });
    await flushPromises();
    expect(w.find(".nav__inquire").attributes("href")).toBe("/inquiry");
    const cta = w.findAll("a").find((a) => a.text().includes("Inquire about this unit"));
    expect(cta.attributes("href")).toContain("/inquiry?as=LESSEE&unit=u1");
  });
```

Add to `client/tests/LandingView.test.js`, inside the existing `describe` block:

```js
  // Lessors inquire too; the landing sends them to signup, so the inquiry
  // route needs a way in that is not the footer.
  it("offers a quiet inquiry link beneath the two role cards", () => {
    const w = mount(LandingView, { global: { stubs } });
    const link = w.find(".hero__aside a");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("/inquiry");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/PublicShellFooter.test.js tests/LandingView.test.js tests/UnitDetailPublicView.test.js --reporter=verbose`

Expected: FAIL — the footer and nav hrefs are `/inquiry?as=LESSEE`, and `.hero__aside` does not exist.

- [ ] **Step 3: Make the footer and nav links role-neutral**

In `client/src/components/PublicShell.vue` line 87, change:

```html
          <RouterLink to="/inquiry?as=LESSEE" class="foot__cta">Make an inquiry</RouterLink>
```

to:

```html
          <RouterLink to="/inquiry" class="foot__cta">Make an inquiry</RouterLink>
```

In `client/src/views/UnitDetailPublicView.vue` line 67, change:

```html
      <RouterLink to="/inquiry?as=LESSEE" class="nav__inquire">Make an inquiry</RouterLink>
```

to:

```html
      <RouterLink to="/inquiry" class="nav__inquire">Make an inquiry</RouterLink>
```

Leave the `inquiryLink` computed on line 58 exactly as it is — the unit CTA keeps `?as=LESSEE&unit=…` because there the role genuinely is known.

- [ ] **Step 4: Add the landing line**

In `client/src/views/LandingView.vue`, add directly after the closing `</div>` of `.choices` and before the closing `</div>` of `.hero__inner`:

```html
        <p class="hero__aside">
          Not ready to decide?
          <RouterLink to="/inquiry">Send us an inquiry</RouterLink>
        </p>
```

Add to the `<style scoped>` block:

```css
/* Deliberately quiet — a third option here would compete with the two cards. */
.hero__aside { margin: 1.6rem 0 0; font-size: 0.9rem; color: var(--muted); }
.hero__aside a { color: var(--accent-text); font-weight: 600; text-decoration: underline; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/PublicShellFooter.test.js tests/LandingView.test.js tests/UnitDetailPublicView.test.js --reporter=verbose`

Expected: PASS.

- [ ] **Step 6: Run the full client suite and build**

Run: `npm test && npm run build`

Expected: all test files pass; build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/PublicShell.vue client/src/views/UnitDetailPublicView.vue client/src/views/LandingView.vue client/tests/PublicShellFooter.test.js client/tests/UnitDetailPublicView.test.js client/tests/LandingView.test.js
git commit -m "feat(inquiry): role-neutral entry points and a landing inquiry link

The footer and unit-detail nav links no longer presume a lessee, and the
landing offers a quiet way into the inquiry form for lessors, who are
otherwise sent to signup."
```

---

## Verification

After Task 3, confirm the whole change end to end:

- [ ] `cd client && npm test` — all files pass.
- [ ] `cd client && npm run build` — clean build.
- [ ] Confirm no reference to the deleted route or component survives:

```bash
grep -rn "InquiryStartView\|/inquire\b" client/src client/tests
```

Expected: no output.

- [ ] Confirm no entry point still presumes a lessee except the unit CTA:

```bash
grep -rn "as=LESSEE" client/src
```

Expected: exactly one hit — the `inquiryLink` computed in `client/src/views/UnitDetailPublicView.vue`.
