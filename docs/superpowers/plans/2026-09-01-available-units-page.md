# Available Units for Lease (Public Page) Implementation Plan (Sub-project J)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public Available Units for Lease page — a grid of unit cards (cover photo + ◀/▶ navigation + configured details), simple filters, and a per-unit detail page — consuming sub-project I's public API. Client only.

**Architecture:** A reusable `UnitCard.vue` (photo carousel + details) used by a public `AvailableUnitsView.vue` grid with estate/type filters, and a `UnitDetailPublicView.vue` detail page. Shared `listingFormat.js` for labels/formatting. Two public routes + a landing-page entry link. No server or schema changes.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, axios (via the existing `publicUnits` resource), Vitest + @vue/test-utils.

## Global Constraints

- Client only — no server/schema/migration changes. `resource.js` already exports `publicUnits` (`list(params)`, `get(unitId)`, `photoUrl(photoId)`) from sub-project I; do not modify it.
- Public routes are top-level (siblings of `/`, `/inquiry`) with NO `meta.roles`/`requiresAuth` — the router guard treats them as public.
- Public images load via `publicUnits.photoUrl(photoId)` in a plain `<img>` (no auth needed). Never fetch public images as authed blobs.
- Detail labels/formatting come from the shared catalog `shared/unitListingFields.js` (`UNIT_LISTING_FIELDS`); only render detail keys actually present in a listing's `details` (staff-chosen visible fields), in catalog order.
- Match the app's existing component style (`<script setup>`, scoped styles, CSS variables/tokens, existing button classes). Keep the grid responsive (mobile = 1 column).

---

### Task 1: Shared formatter + reusable UnitCard

**Files:**
- Create: `client/src/lib/listingFormat.js`, `client/src/components/UnitCard.vue`
- Test: `client/tests/listingFormat.test.js`, `client/tests/UnitCard.test.js`

**Interfaces:**
- Produces: `labelFor(key)`, `formatDetail(key, value)`, `orderedDetails(details)` from `listingFormat.js`; `UnitCard` (prop `card`).

- [ ] **Step 1: Write the failing formatter test**

Create `client/tests/listingFormat.test.js`:
```js
import { describe, it, expect } from "vitest";
import { labelFor, formatDetail, orderedDetails } from "../src/lib/listingFormat.js";

describe("listingFormat", () => {
  it("labels keys from the shared catalog", () => {
    expect(labelFor("rentalRate")).toMatch(/rental rate/i);
    expect(labelFor("unknownKey")).toBe("unknownKey");
  });
  it("formats rentalRate as currency and amenities as a list", () => {
    expect(formatDetail("rentalRate", 45000)).toMatch(/45,000/);
    expect(formatDetail("amenities", ["Pool", "Gym"])).toBe("Pool, Gym");
    expect(formatDetail("bedrooms", 2)).toBe("2");
  });
  it("orders details by catalog order and drops empty values", () => {
    const out = orderedDetails({ rentalRate: 45000, unitNumber: "12A", bogus: "x", blank: "" });
    const keys = out.map((d) => d.key);
    expect(keys).toContain("unitNumber");
    expect(keys).toContain("rentalRate");
    expect(keys.indexOf("unitNumber")).toBeLessThan(keys.indexOf("rentalRate")); // catalog order
    expect(keys).not.toContain("bogus"); // not a catalog key
  });
});
```

- [ ] **Step 2: Run — verify fail** (from `client/`) `npx vitest run tests/listingFormat.test.js` → FAIL.

- [ ] **Step 3: Implement the formatter**

Create `client/src/lib/listingFormat.js`:
```js
import { UNIT_LISTING_FIELDS } from "../../../shared/unitListingFields.js";

const BY_KEY = Object.fromEntries(UNIT_LISTING_FIELDS.map((f) => [f.key, f]));

export function labelFor(key) { return BY_KEY[key]?.label || key; }

export function formatDetail(key, value) {
  if (value == null || value === "") return "";
  const field = BY_KEY[key];
  if (Array.isArray(value)) return value.join(", ");
  if (key === "rentalRate" || (field?.type === "number" && key === "rentalRate")) {
    const n = Number(value);
    return Number.isFinite(n) ? `₱${n.toLocaleString("en-PH")}` : String(value);
  }
  return String(value);
}

// Returns [{ key, label, value }] for catalog-known keys present in `details`,
// in catalog order, skipping empty values.
export function orderedDetails(details = {}) {
  const out = [];
  for (const f of UNIT_LISTING_FIELDS) {
    const v = details[f.key];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out.push({ key: f.key, label: f.label, value: formatDetail(f.key, v) });
  }
  return out;
}
```

- [ ] **Step 4: Run — verify pass** `npx vitest run tests/listingFormat.test.js` → PASS.

- [ ] **Step 5: Write the failing UnitCard test**

Create `client/tests/UnitCard.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({ publicUnits: { photoUrl: (id) => `/api/public/units/photo/${id}` } }));
import UnitCard from "../src/components/UnitCard.vue";

const card = {
  unitId: "u1", headline: "Maven 12A", type: "2BR", location: "Tower A, Capitol",
  details: { unitNumber: "12A", rentalRate: 45000, bedrooms: 2 },
  coverPhotoId: "p2", photoIds: ["p1", "p2", "p3"],
};
const stubs = { RouterLink: { template: "<a><slot /></a>", props: ["to"] } };

describe("UnitCard", () => {
  it("shows the cover photo first and the configured details", () => {
    const w = mount(UnitCard, { props: { card }, global: { stubs } });
    const img = w.find("img");
    expect(img.attributes("src")).toBe("/api/public/units/photo/p2"); // cover first
    expect(w.text()).toContain("12A");
    expect(w.text()).toMatch(/45,000/); // currency-formatted rentalRate
  });
  it("cycles photos with the arrows (wraps) and hides arrows with <=1 photo", async () => {
    const w = mount(UnitCard, { props: { card }, global: { stubs } });
    const next = w.findAll("button").find((b) => /next|▶|›|>/.test(b.text()) || b.attributes("aria-label")?.match(/next/i));
    expect(next).toBeTruthy();
    await next.trigger("click");
    // from cover p2 → next is p3
    expect(w.find("img").attributes("src")).toBe("/api/public/units/photo/p3");
    // single-photo card hides arrows
    const one = mount(UnitCard, { props: { card: { ...card, photoIds: ["p1"], coverPhotoId: "p1" } }, global: { stubs } });
    expect(one.findAll("button").some((b) => /next|▶|›/.test(b.text()) || b.attributes("aria-label")?.match(/next/i))).toBe(false);
  });
});
```
> Adapt the arrow-button selector to your final markup (use `aria-label="Next photo"`/`"Previous photo"` so the test can target them reliably).

- [ ] **Step 6: Run — verify fail** `npx vitest run tests/UnitCard.test.js` → FAIL.

- [ ] **Step 7: Build `UnitCard.vue`**

Create `client/src/components/UnitCard.vue` (`<script setup>`, scoped styles, tokens). Requirements:
- Props: `card`.
- Local `index` starts at the position of `card.coverPhotoId` in `card.photoIds` (or 0). `current = card.photoIds[index]`.
- Photo area: `<img :src="publicUnits.photoUrl(current)" :alt="card.headline || 'Unit photo'" @error="broken = true">`; if `card.photoIds.length === 0` or `broken`, show a placeholder block instead.
- **◀/▶ buttons** with `aria-label="Previous photo"`/`"Next photo"`, shown only when `card.photoIds.length > 1`; prev/next wrap around (`(index + n + len) % len`). A small `index+1 / len` counter or dots.
- Body: a title (`card.headline` || `details.propertyName` || `details.unitNumber` || "Unit"), the `card.location` line, and `orderedDetails(card.details)` rendered as labelled lines (`{{ d.label }}: {{ d.value }}`).
- A **View details** `<RouterLink :to="`/units-for-lease/${card.unitId}`">` (button-styled).
- Import `{ publicUnits }` from `../lib/resource.js` and `{ orderedDetails }` from `../lib/listingFormat.js`.

- [ ] **Step 8: Run — verify pass, full client suite** `npx vitest run tests/UnitCard.test.js` then `npx vitest run`.

- [ ] **Step 9: Commit**
```bash
git add client/src/lib/listingFormat.js client/src/components/UnitCard.vue client/tests/listingFormat.test.js client/tests/UnitCard.test.js
git commit -m "feat(available-units): listing formatter + reusable UnitCard"
```

---

### Task 2: Public grid page + route + landing entry

**Files:**
- Create: `client/src/views/AvailableUnitsView.vue`
- Modify: `client/src/router/index.js` (public route), `client/src/views/InquiryStartView.vue` (entry link)
- Test: `client/tests/AvailableUnitsView.test.js`

**Interfaces:**
- Consumes: `publicUnits.list(params)`; `UnitCard`.

- [ ] **Step 1: Write the failing test**

Create `client/tests/AvailableUnitsView.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: {
    list: vi.fn(() => Promise.resolve([
      { unitId: "u1", headline: "A", type: "2BR", location: "Tower A", estate: { id: "e1", name: "Capitol" }, details: { unitNumber: "12A" }, coverPhotoId: "p1", photoIds: ["p1"] },
      { unitId: "u2", headline: "B", type: "STUDIO", location: "Tower B", estate: { id: "e2", name: "Ortigas" }, details: { unitNumber: "3C" }, coverPhotoId: "p2", photoIds: ["p2"] },
    ])),
    photoUrl: (id) => `/api/public/units/photo/${id}`,
  },
}));
import AvailableUnitsView from "../src/views/AvailableUnitsView.vue";
import { publicUnits } from "../src/lib/resource.js";
const stubs = { RouterLink: { template: "<a><slot /></a>", props: ["to"] } };

describe("AvailableUnitsView", () => {
  it("renders a card per unit and derives filter options", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.findAllComponents({ name: "UnitCard" }).length).toBe(2);
    // estate + type options derived from the set
    expect(w.text()).toContain("Capitol");
    expect(w.text()).toContain("Ortigas");
  });
  it("re-queries with filter params", async () => {
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    const typeSelect = w.findAll("select").at(-1); // type filter
    await typeSelect.setValue("2BR");
    await flushPromises();
    expect(publicUnits.list).toHaveBeenLastCalledWith(expect.objectContaining({ type: "2BR" }));
  });
  it("shows an empty state when none", async () => {
    publicUnits.list.mockResolvedValueOnce([]);
    const w = mount(AvailableUnitsView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toMatch(/no units/i);
  });
});
```
> `UnitCard` must have `name: "UnitCard"` (add `defineOptions({ name: "UnitCard" })` in Task 1's component, or the test can match by class). Adapt the select ordering to your markup.

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/AvailableUnitsView.test.js` → FAIL.

- [ ] **Step 3: Build `AvailableUnitsView.vue`**

Create `client/src/views/AvailableUnitsView.vue` (`<script setup>`, scoped styles). Requirements:
- On mount: `all.value = await publicUnits.list()` (unfiltered) → derive `estateOptions` (distinct `card.estate` by id) and `typeOptions` (distinct `card.type`), keep `all` for options; set `units.value = all.value`.
- Two `<select>`s bound to `estateId` and `type` refs (+ a Clear button). A `watch`/handler on either → `units.value = await publicUnits.list({ estateId: estateId.value || undefined, type: type.value || undefined })`.
- Header ("Available Units for Lease"), a result count, a responsive CSS-grid of `<UnitCard :card="c" v-for="c in units" :key="c.unitId" />`.
- Empty state ("No units match your filters." when filtered, "No units are currently available." when `all` is empty). An error line on load failure (try/catch).
- A Home/back link to `/`.

- [ ] **Step 4: Route + landing link**

In `client/src/router/index.js`, import `AvailableUnitsView` and add a TOP-LEVEL public route (beside `/inquiry`):
```js
{ path: "/units-for-lease", component: AvailableUnitsView },
```
In `client/src/views/InquiryStartView.vue`, add a visible "Browse available units" link/button (e.g. below the role grid) → `router.push("/units-for-lease")` (or a `<RouterLink to="/units-for-lease">`). Keep it additive and styled with existing classes.

- [ ] **Step 5: Run — verify pass, full client suite** `npx vitest run tests/AvailableUnitsView.test.js` then `npx vitest run`.

- [ ] **Step 6: Commit**
```bash
git add client/src/views/AvailableUnitsView.vue client/src/router/index.js client/src/views/InquiryStartView.vue client/tests/AvailableUnitsView.test.js
git commit -m "feat(available-units): public grid page + filters + landing entry"
```

---

### Task 3: Public unit detail page + route

**Files:**
- Create: `client/src/views/UnitDetailPublicView.vue`
- Modify: `client/src/router/index.js` (public detail route)
- Test: `client/tests/UnitDetailPublicView.test.js`

**Interfaces:**
- Consumes: `publicUnits.get(unitId)`, `publicUnits.photoUrl`; `orderedDetails`.

- [ ] **Step 1: Write the failing test**

Create `client/tests/UnitDetailPublicView.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "u1" } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: {
    get: vi.fn(() => Promise.resolve({
      unitId: "u1", headline: "Maven 12A", location: "Tower A",
      details: { unitNumber: "12A", rentalRate: 45000, amenities: ["Pool", "Gym"] },
      photos: [{ id: "p1", caption: "Living" }, { id: "p2", caption: null }], photoIds: ["p1", "p2"], coverPhotoId: "p1",
    })),
    photoUrl: (id) => `/api/public/units/photo/${id}`,
  },
}));
import UnitDetailPublicView from "../src/views/UnitDetailPublicView.vue";
import { publicUnits } from "../src/lib/resource.js";

describe("UnitDetailPublicView", () => {
  it("renders all details and a carousel", async () => {
    const w = mount(UnitDetailPublicView);
    await flushPromises();
    expect(w.text()).toContain("12A");
    expect(w.text()).toMatch(/45,000/);
    expect(w.text()).toContain("Pool, Gym");
    expect(w.find("img").attributes("src")).toBe("/api/public/units/photo/p1");
    const next = w.findAll("button").find((b) => b.attributes("aria-label")?.match(/next/i) || /▶|›|next/i.test(b.text()));
    await next.trigger("click");
    expect(w.find("img").attributes("src")).toBe("/api/public/units/photo/p2");
  });
  it("shows a not-available message on 404", async () => {
    publicUnits.get.mockRejectedValueOnce({ response: { status: 404 } });
    const w = mount(UnitDetailPublicView);
    await flushPromises();
    expect(w.text()).toMatch(/no longer available|not available|not found/i);
  });
});
```

- [ ] **Step 2: Run — verify fail** `npx vitest run tests/UnitDetailPublicView.test.js` → FAIL.

- [ ] **Step 3: Build `UnitDetailPublicView.vue`**

Create `client/src/views/UnitDetailPublicView.vue` (`<script setup>`, scoped styles). Requirements:
- `useRoute()` → `id`. On mount, `unit.value = await publicUnits.get(id)`; catch → set `notFound = true`.
- If `notFound`: render "This unit is no longer available." + a link back to `/units-for-lease`.
- Else: a **carousel** over `unit.photoIds` — a main `<img :src="publicUnits.photoUrl(current)">` with `aria-label`ed ◀/▶ buttons (wrap-around) and dots/thumbnails; show the current photo's `caption` (from `unit.photos`) when present.
- A title (`headline`), `location`, and `orderedDetails(unit.details)` as a labelled spec list.
- A back link to `/units-for-lease`.
- Import `{ publicUnits }` and `{ orderedDetails }`.

- [ ] **Step 4: Route**

In `client/src/router/index.js`, add a TOP-LEVEL public route AFTER `/units-for-lease`:
```js
{ path: "/units-for-lease/:id", component: UnitDetailPublicView },
```

- [ ] **Step 5: Run — verify pass, full client suite** `npx vitest run tests/UnitDetailPublicView.test.js` then `npx vitest run`.

- [ ] **Step 6: Commit**
```bash
git add client/src/views/UnitDetailPublicView.vue client/src/router/index.js client/tests/UnitDetailPublicView.test.js
git commit -m "feat(available-units): public unit detail page + carousel"
```

---

## Self-Review

**Spec coverage:** formatter (T1) ✓; reusable card with cover-first + ◀/▶ wrap + hidden-when-≤1 (T1) ✓; grid page with derived filters + server-side filtering + empty state + route + landing link (T2) ✓; detail page carousel + full details + 404 state + route (T3) ✓. Error handling: list error line, empty state, detail 404 message, `<img>` onerror placeholder — all in the task requirements/tests.

**Type consistency:** `orderedDetails`/`labelFor`/`formatDetail` (T1) reused by card (T1) and detail (T3). `publicUnits.list/get/photoUrl` (from sub-project I) used consistently. Both new routes are top-level public (no meta). `UnitCard` gets `name: "UnitCard"` so the grid test can find it.

**Adaptation points flagged inline:** arrow-button selector → use `aria-label` (T1/T3), select ordering (T2), `defineOptions({ name })` on UnitCard (T1/T2). No server/schema changes.
