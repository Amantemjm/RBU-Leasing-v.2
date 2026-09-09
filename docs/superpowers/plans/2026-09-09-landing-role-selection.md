# Landing Page as Role-Selection Entry Point — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` a role-selection landing page (no Featured Properties); the lessee "Get Started" goes to a browse page at `/available-units`, and the lessor "List Your Unit" goes to Unit Owner signup (`/signup?as=LESSOR`).

**Architecture:** Extract the hero + role cards from `AvailableUnitsView.vue` into a new `LandingView.vue` mounted at `/`. Repurpose `AvailableUnitsView.vue` (hero removed) as the `/available-units` browse page. Re-point the two CTAs and stray browse links; make `SignupView` preselect the role from `?as=`. Client-only (Vue 3 + Vite, Vitest).

**Tech Stack:** Vue 3 `<script setup>`, vue-router, Vitest + @vue/test-utils.

## Global Constraints

- Client-only change — no server, API, or schema changes.
- The landing page (`/`) must NOT render Featured Properties and must NOT call `publicUnits.list()`.
- Lessee "Get Started" → `/available-units`; Lessor "List Your Unit" → `/signup?as=LESSOR`.
- Browse page route is `/available-units`; the unit detail route stays `/units-for-lease/:id`.
- Public pages use `PublicShell` and set route meta `ownsThemeToggle: true`.

---

### Task 1: LandingView (role-selection page)

**Files:**
- Create: `client/src/views/LandingView.vue`
- Test: `client/tests/LandingView.test.js`

**Interfaces:**
- Produces: `LandingView.vue` default export — a public page whose Lessee CTA links to `/available-units` and Lessor CTA links to `/signup?as=LESSOR`. Renders no Featured Properties and imports no listings API.

- [ ] **Step 1: Write the failing test**

Create `client/tests/LandingView.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LandingView from "../src/views/LandingView.vue";

const stubs = { RouterLink: { template: "<a :href='to'><slot /></a>", props: ["to"] } };

describe("LandingView (role selection)", () => {
  it("offers the two role choices with the correct destinations", () => {
    const w = mount(LandingView, { global: { stubs } });
    const hrefs = w.findAll(".choice").map((c) => c.attributes("href"));
    expect(hrefs).toContain("/available-units");
    expect(hrefs).toContain("/signup?as=LESSOR");
  });

  it("does not show a Featured Properties section on the landing page", () => {
    const w = mount(LandingView, { global: { stubs } });
    expect(w.find(".featured").exists()).toBe(false);
    expect(w.text()).not.toContain("Featured properties");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- LandingView`
Expected: FAIL — cannot resolve `../src/views/LandingView.vue`.

- [ ] **Step 3: Create the component**

Create `client/src/views/LandingView.vue` (hero + role cards extracted from `AvailableUnitsView.vue`, CTAs re-pointed):

```vue
<script setup>
// Public landing page: a role-selection entry point. A lessee browses available
// units; a lessor signs up as a Unit Owner. No listings are shown here.
import { RouterLink } from "vue-router";
import PublicShell from "../components/PublicShell.vue";
</script>

<template>
  <PublicShell main-label="Get started" skip-label="Skip to the options">
    <section class="hero" aria-label="Introduction">
      <div class="hero__inner">
        <p class="eyebrow">Welcome to Residential Leasing by Ortigas Land</p>
        <h1 class="hero__title">Home Lease, Made Simple</h1>
        <p class="hero__lede">
          Looking to move into a new rental property, or have a unit you'd like to list and find the
          perfect tenant? Choose the option that best describes you.
        </p>
        <div class="choices">
          <RouterLink to="/available-units" class="choice">
            <span class="choice__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" /></svg>
            </span>
            <span class="choice__t">I'm a Lessee</span>
            <span class="choice__d">Find and rent a residence or office</span>
            <span class="choice__go">Get started <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RouterLink>
          <RouterLink to="/signup?as=LESSOR" class="choice">
            <span class="choice__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14" /><path d="M10 9h4M10 13h4M10 17h4" /></svg>
            </span>
            <span class="choice__t">I'm a Lessor</span>
            <span class="choice__d">List your unit and find a tenant</span>
            <span class="choice__go">List your unit <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RouterLink>
        </div>
      </div>
    </section>
  </PublicShell>
</template>

<style scoped>
.hero {
  position: relative;
  background: transparent;
  color: var(--text);
  padding: clamp(3rem, 8vw, 5.5rem) clamp(1rem, 4vw, 3rem) clamp(2.5rem, 6vw, 4rem);
  text-align: center;
}
.hero__inner { max-width: 60rem; margin: 0 auto; }
.eyebrow { margin: 0 0 1rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; color: var(--accent-text); }
.hero__title { margin: 0; color: var(--ink-800); font-family: var(--display, Georgia, serif); font-weight: 600; font-size: clamp(2.2rem, 6vw, 4rem); line-height: 1.05; letter-spacing: -0.01em; }
.hero__lede { margin: 1.15rem auto 0; max-width: 40rem; font-size: clamp(0.98rem, 2vw, 1.12rem); line-height: 1.6; color: var(--muted); }
.choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 44rem; margin: 2.25rem auto 0; }
.choice {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
  padding: 1.35rem 1.4rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
.choice:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--accent-text); }
.choice__ic { width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-050); color: var(--accent-text); }
.choice__t { font-family: var(--display, Georgia, serif); font-size: 1.3rem; font-weight: 600; margin-top: 0.35rem; color: var(--ink-800); }
.choice__d { font-size: 0.88rem; color: var(--muted); }
.choice__go { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.35rem; font-size: 0.82rem; font-weight: 700; color: var(--accent-text); }
.choice__go svg { transition: transform 0.18s ease; }
.choice:hover .choice__go svg { transform: translateX(3px); }

@media (max-width: 720px) { .choices { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .choice:hover { transform: none; } }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client run test -- LandingView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/LandingView.vue client/tests/LandingView.test.js
git commit -m "feat(landing): role-selection LandingView (lessee browse / lessor signup)"
```

---

### Task 2: AvailableUnitsView becomes the browse page

**Files:**
- Modify: `client/src/views/AvailableUnitsView.vue` (remove the `#hero` slot + role cards and their styles; add an "Available Units" heading)
- Test: `client/tests/AvailableUnitsView.test.js` (add an assertion that the role cards are gone)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AvailableUnitsView.vue` renders only the Featured Properties browse UI (grid, filters, states) — no role-selection choice cards.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("AvailableUnitsView", ...)` block in `client/tests/AvailableUnitsView.test.js`:

```js
  it("no longer shows the role-selection choice cards (moved to the landing page)", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.find(".choice").exists()).toBe(false);
    expect(w.find(".featured").exists()).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- AvailableUnitsView`
Expected: FAIL — `.choice` elements still exist (the hero is still in this view).

- [ ] **Step 3: Remove the hero from the template**

In `client/src/views/AvailableUnitsView.vue`, delete the entire `<template #hero> … </template>` block (the `<section class="hero">` with both `.choice` RouterLinks). The `<template>` should now open the `PublicShell` and go straight to the `<div class="featured">` block. Replace the opening of the featured block's heading to add a page title. Change:

```html
      <div class="featured__head">
        <div>
          <p class="section-eyebrow">Now leasing</p>
          <h2 class="section-title">Featured properties</h2>
        </div>
```

to:

```html
      <div class="featured__head">
        <div>
          <p class="section-eyebrow">Now leasing</p>
          <h1 class="section-title">Available Units</h1>
        </div>
```

(So the browse page has a top-level heading. The rest of the featured block — filters, count, grid, skeletons, empty state — is unchanged.)

- [ ] **Step 4: Remove the now-unused hero styles**

In the `<style scoped>` block of `AvailableUnitsView.vue`, delete the hero/choice style rules that moved to `LandingView`: `.hero`, `.hero__inner`, `.eyebrow`, `.hero__title`, `.hero__lede`, `.choices`, `.choice`, `.choice:hover`, `.choice__ic`, `.choice__t`, `.choice__d`, `.choice__go`, `.choice__go svg`, `.choice:hover .choice__go svg`, and the `.choices { grid-template-columns: 1fr; }` line inside the `@media (max-width: 720px)` block plus the `.choice:hover { transform: none; }` line inside the `@media (prefers-reduced-motion: reduce)` block. Keep every `.featured*`, `.filter*`, `.count`, `.error-line`, `.grid`, `.skeleton*`, `.sk-*`, `.empty*`, `@keyframes shimmer`, `.featured__head` rule and the remaining media-query lines (`.featured__head { align-items: stretch; }`, `.skeleton …{ animation: none; }`).

- [ ] **Step 5: Update the file comment**

Change the top comment in `AvailableUnitsView.vue` from "Public front page … a welcome hero with the lessee/lessor choice, plus a browsable grid …" to:

```js
// Public browse page (/available-units): a browsable grid of available units,
// driven by the public listings API (no auth). Reached from the landing page's
// "I'm a Lessee → Get Started".
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --workspace client run test -- AvailableUnitsView`
Expected: PASS (the new `.choice` absence test passes; the existing grid + header tests still pass).

- [ ] **Step 7: Commit**

```bash
git add client/src/views/AvailableUnitsView.vue client/tests/AvailableUnitsView.test.js
git commit -m "refactor(browse): AvailableUnitsView is the /available-units browse page (hero removed)"
```

---

### Task 3: Routing

**Files:**
- Modify: `client/src/router/index.js`
- Test: `client/tests/router.test.js`

**Interfaces:**
- Consumes: `LandingView.vue` (Task 1), `AvailableUnitsView.vue` (Task 2).
- Produces: `/` → `LandingView`; `/available-units` → `AvailableUnitsView`; `/units-for-lease` redirects to `/available-units`.

- [ ] **Step 1: Update the failing tests**

In `client/tests/router.test.js`, add the `LandingView` import at the top:

```js
import LandingView from "../src/views/LandingView.vue";
```

Replace the two existing route assertions. Change:

```js
  it("serves Available Units at /, the user-type start page at /inquire, and the Inquiry form at /inquiry", () => {
    expect(router.resolve("/").matched[0].components.default).toBe(AvailableUnitsView);
    expect(router.resolve("/inquire").matched[0].components.default).toBe(InquiryStartView);
    expect(router.resolve("/inquiry").matched[0].components.default).toBe(InquiryView);
  });

  it("redirects the old /units-for-lease list path to the home page", async () => {
    await router.push("/units-for-lease");
    expect(router.currentRoute.value.path).toBe("/");
  });
```

to:

```js
  it("serves the landing page at /, available units at /available-units, and the Inquiry form at /inquiry", () => {
    expect(router.resolve("/").matched[0].components.default).toBe(LandingView);
    expect(router.resolve("/available-units").matched[0].components.default).toBe(AvailableUnitsView);
    expect(router.resolve("/inquire").matched[0].components.default).toBe(InquiryStartView);
    expect(router.resolve("/inquiry").matched[0].components.default).toBe(InquiryView);
  });

  it("redirects the old /units-for-lease list path to the browse page", async () => {
    await router.push("/units-for-lease");
    expect(router.currentRoute.value.path).toBe("/available-units");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace client run test -- router`
Expected: FAIL — `/` still resolves to `AvailableUnitsView`; `/units-for-lease` still redirects to `/`.

- [ ] **Step 3: Add the import**

In `client/src/router/index.js`, add near the other view imports:

```js
import LandingView from "../views/LandingView.vue";
```

- [ ] **Step 4: Update the routes**

In `client/src/router/index.js`, change the first public routes. Replace:

```js
  { path: "/", component: AvailableUnitsView, meta: { ownsThemeToggle: true } }, // public front page: browse published listings
```

with:

```js
  { path: "/", component: LandingView, meta: { ownsThemeToggle: true } }, // public landing: role-selection entry point
  { path: "/available-units", component: AvailableUnitsView, meta: { ownsThemeToggle: true } }, // public browse page (lessee "Get Started")
```

And change the legacy redirect:

```js
  { path: "/units-for-lease", redirect: "/" }, // legacy list path → front page
```

to:

```js
  { path: "/units-for-lease", redirect: "/available-units" }, // legacy list path → browse page
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --workspace client run test -- router`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/router/index.js client/tests/router.test.js
git commit -m "feat(router): landing at /, browse at /available-units, legacy redirect updated"
```

---

### Task 4: Signup preselects the role from `?as=`

**Files:**
- Modify: `client/src/views/SignupView.vue`
- Test: `client/tests/SignupView.test.js`

**Interfaces:**
- Produces: `SignupView` preselects `role = "UNIT_OWNER"` when the URL is `/signup?as=LESSOR` (and `"TENANT"` for `?as=LESSEE`), while the toggle stays user-editable.

- [ ] **Step 1: Write the failing test**

In `client/tests/SignupView.test.js`, add a mount helper variant and a test. After the existing `mountSignup` helper, add:

```js
async function mountSignupAs(as) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push(`/signup?as=${as}`);
  await router.isReady();
  return mount(SignupView, { global: { plugins: [router] } });
}

it("preselects the Unit Owner role from ?as=LESSOR", async () => {
  const w = await mountSignupAs("LESSOR");
  const lessor = w.findAll(".roles button").find((b) => b.text().includes("Lessor"));
  expect(lessor.classes()).toContain("on");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client run test -- SignupView`
Expected: FAIL — the Lessor button is not `on` (role defaults to `TENANT`).

- [ ] **Step 3: Implement the preselect**

In `client/src/views/SignupView.vue`, add `useRoute` to the vue-router import and initialize `role` from the query. Change:

```js
import { ref, computed, watch } from "vue";
import { RouterLink } from "vue-router";
```

to:

```js
import { ref, computed, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
```

and change:

```js
const role = ref("TENANT"); // "TENANT" (lessee) | "UNIT_OWNER" (lessor)
```

to:

```js
// Preselect the role from ?as= (LESSOR → Unit Owner, LESSEE → Tenant); the
// toggle stays user-editable. Defaults to Tenant.
const route = useRoute();
const role = ref(route.query.as === "LESSOR" ? "UNIT_OWNER" : "TENANT");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client run test -- SignupView`
Expected: PASS (and the existing SignupView tests still pass).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/SignupView.vue client/tests/SignupView.test.js
git commit -m "feat(signup): preselect Unit Owner role from ?as=LESSOR"
```

---

### Task 5: Re-point stray browse links to `/available-units`

**Files:**
- Modify: `client/src/views/InquiryStartView.vue` (the "Browse available units" link)
- Modify: `client/src/views/UnitDetailPublicView.vue` (the "Back to Available Units" link and the not-found "See available units" link)
- Test: `client/tests/InquiryStartView.test.js` (only if it asserts the browse link href — see Step 1)

**Interfaces:**
- Consumes: the `/available-units` route (Task 3).
- Produces: public "browse" links point at `/available-units` instead of `/`.

- [ ] **Step 1: Check the InquiryStartView test for a browse-link assertion**

Run: `grep -n "available units\|Browse\|to=\\\"/\\\"" client/tests/InquiryStartView.test.js`

If a test asserts the browse link's `href` is `/`, update that expected value to `/available-units` (write the failing test first, run it to confirm it fails, then do Step 2). If no such assertion exists, skip to Step 2 — the change is covered by the router test plus manual verification.

- [ ] **Step 2: Update InquiryStartView**

In `client/src/views/InquiryStartView.vue`, change:

```html
      <RouterLink to="/">Browse available units &rarr;</RouterLink>
```

to:

```html
      <RouterLink to="/available-units">Browse available units &rarr;</RouterLink>
```

- [ ] **Step 3: Update UnitDetailPublicView**

In `client/src/views/UnitDetailPublicView.vue`, change both browse links from `to="/"` to `to="/available-units"`:

```html
      <RouterLink to="/available-units" class="back-link">&larr; Back to Available Units</RouterLink>
```

and

```html
        <RouterLink to="/available-units" class="not-found__cta">See available units</RouterLink>
```

- [ ] **Step 4: Run the affected tests**

Run: `npm --workspace client run test -- InquiryStartView UnitDetailPublicView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/views/InquiryStartView.vue client/src/views/UnitDetailPublicView.vue client/tests/InquiryStartView.test.js
git commit -m "refactor(links): point public browse links at /available-units"
```

---

## Final verification

- [ ] Run the full client suite: `npm --workspace client run test` — all green.
- [ ] Rebuild so `:5050` serves it: `npm --workspace client run build`.
- [ ] Manual smoke (dev server on :5050, hard refresh): `/` shows only the two role cards (no Featured Properties); clicking **Get Started** goes to `/available-units` (the grid); clicking **List Your Unit** goes to `/signup` with the **Lessor** role preselected; a unit's detail page "Back to Available Units" returns to `/available-units`.

## Deployment note

Client-only change — no migration or server restart semantics beyond serving the rebuilt client bundle.
