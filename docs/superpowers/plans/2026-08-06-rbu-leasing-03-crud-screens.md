# RBU Leasing — Plan 3: Vue CRUD Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vue data-entry UI — list + create/edit/delete screens for owners, units, tenants, leases, and payments — consuming the Plan 2 CRUD APIs, with role-aware controls.

**Architecture:** Reuse the Plan 1 Vue foundation (Vue 3 + Vite + Pinia + Router + Axios). A generic `resource(path)` API factory over the existing `api.js` and two generic components (`ResourceTable`, `ResourceForm`) keep the five entities DRY. An `AppLayout` shell provides nav + logout around routed child views. Role gating reuses the auth store's `role` getter.

**Tech Stack:** Vue 3, Vite, Pinia, Vue Router, Axios, Vitest + @vue/test-utils + happy-dom (new, client-side testing).

## Global Constraints

- Reuse the existing client foundation; do not restructure Plan 1 files beyond what each task specifies.
- All HTTP goes through the existing `client/src/lib/api.js` Axios instance (baseURL `/api`, JWT interceptor). No new Axios instances.
- Currency: PHP. Money shown via `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })`.
- Roles: `ADMIN | LEASING_OFFICER | VIEWER`. Create/edit/delete controls render ONLY for ADMIN or LEASING_OFFICER; VIEWER sees read-only lists (spec: "frontend hides/disables actions the role can't perform").
- Number/date form inputs bind as strings; the Plan 2 API validates with `z.coerce.*`, so string values are accepted — do not pre-parse in the client.
- API errors: show `err.response?.data?.error` (Plan 2 returns `{ error, ... }` for 400/404/409) inline on forms or via `alert` on list actions.
- TDD: the reusable logic units (resource factory, formatters, `ResourceTable`, `ResourceForm`, `AppLayout`, and each list view's role gating) get failing tests first. Assembled form screens are verified in a real browser (Task 7), matching Plan 1's Task 7 approach.
- Commit after each green task.

---

## File Structure (this plan)

```
client/
  vitest.config.js            NEW: happy-dom env + vue plugin
  package.json                MODIFY: add "test" script + dev deps
  src/
    lib/
      resource.js             NEW: resource(path) factory + owners/units/tenants/leases/payments
      formatters.js           NEW: formatPHP, formatDate, toDateInput
    components/
      ResourceTable.vue       NEW: generic role-aware table
      ResourceForm.vue        NEW: generic field-schema form
      AppLayout.vue           NEW: nav + logout shell
    views/
      DashboardView.vue       MODIFY: drop its own logout (layout owns it)
      OwnersView.vue          NEW (list)   + OwnerFormView.vue   NEW (create/edit)
      TenantsView.vue         NEW          + TenantFormView.vue  NEW
      UnitsView.vue           NEW          + UnitFormView.vue    NEW
      LeasesView.vue          NEW          + LeaseFormView.vue   NEW
      PaymentsView.vue        NEW          + PaymentFormView.vue NEW
    router/index.js           MODIFY: nest entity routes under AppLayout
  tests/
    resource.test.js          NEW
    formatters.test.js        NEW
    ResourceTable.test.js     NEW
    ResourceForm.test.js      NEW
    AppLayout.test.js         NEW
    OwnersView.test.js        NEW  (+ Tenants/Units/Leases/Payments view tests)
```

---

### Task 1: Client test harness + resource factory + formatters

**Files:**
- Create: `client/vitest.config.js`, `client/src/lib/resource.js`, `client/src/lib/formatters.js`, `client/tests/resource.test.js`, `client/tests/formatters.test.js`
- Modify: `client/package.json`

**Interfaces:**
- Consumes: `api` from `client/src/lib/api.js`.
- Produces:
  - `resource(path) -> { list(params?), get(id), create(data), update(id, data), remove(id) }`, plus named instances `owners, units, tenants, leases, payments`.
  - `formatPHP(amount) -> string`, `formatDate(iso) -> "YYYY-MM-DD"`, `toDateInput(iso) -> "YYYY-MM-DD"`.

- [ ] **Step 1: Install client test deps**

```bash
npm --workspace client install -D vitest @vue/test-utils happy-dom
```

- [ ] **Step 2: Add the client test script**

Modify `client/package.json` — add `"test": "vitest run"` to `scripts`:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Write the failing tests**

`client/vitest.config.js`:

```js
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: { environment: "happy-dom" },
});
```

`client/tests/formatters.test.js`:

```js
import { describe, it, expect } from "vitest";
import { formatPHP, formatDate, toDateInput } from "../src/lib/formatters.js";

describe("formatters", () => {
  it("formats a number as PHP currency", () => {
    expect(formatPHP(25000)).toContain("25,000");
  });
  it("formats a Decimal string as PHP currency", () => {
    expect(formatPHP("80000")).toContain("80,000");
  });
  it("returns empty string for non-numeric", () => {
    expect(formatPHP(null)).toBe("");
  });
  it("slices an ISO datetime to YYYY-MM-DD", () => {
    expect(toDateInput("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
    expect(formatDate("2026-12-31T00:00:00.000Z")).toBe("2026-12-31");
  });
});
```

`client/tests/resource.test.js`:

```js
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/api.js", () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: [{ id: "1" }] })),
    post: vi.fn(() => Promise.resolve({ data: { id: "2" } })),
    patch: vi.fn(() => Promise.resolve({ data: { id: "3" } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import { api } from "../src/lib/api.js";
import { resource } from "../src/lib/resource.js";

describe("resource factory", () => {
  it("list() GETs the path with params and returns data", async () => {
    const r = resource("/owners");
    const data = await r.list({ ownerId: "x" });
    expect(api.get).toHaveBeenCalledWith("/owners", { params: { ownerId: "x" } });
    expect(data).toEqual([{ id: "1" }]);
  });
  it("get() GETs path/:id", async () => {
    await resource("/owners").get("abc");
    expect(api.get).toHaveBeenCalledWith("/owners/abc");
  });
  it("create() POSTs the path", async () => {
    await resource("/owners").create({ name: "A" });
    expect(api.post).toHaveBeenCalledWith("/owners", { name: "A" });
  });
  it("update() PATCHes path/:id", async () => {
    await resource("/units").update("u1", { baseRent: 1 });
    expect(api.patch).toHaveBeenCalledWith("/units/u1", { baseRent: 1 });
  });
  it("remove() DELETEs path/:id", async () => {
    await resource("/units").remove("u1");
    expect(api.delete).toHaveBeenCalledWith("/units/u1");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm --workspace client test`
Expected: FAIL — cannot import `../src/lib/resource.js` / `../src/lib/formatters.js` (module not found).

- [ ] **Step 5: Write the implementation**

`client/src/lib/formatters.js`:

```js
const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function formatPHP(amount) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return "";
  return php.format(n);
}

export function formatDate(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

export function toDateInput(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}
```

`client/src/lib/resource.js`:

```js
import { api } from "./api.js";

export function resource(path) {
  return {
    list: (params) => api.get(path, { params }).then((r) => r.data),
    get: (id) => api.get(`${path}/${id}`).then((r) => r.data),
    create: (data) => api.post(path, data).then((r) => r.data),
    update: (id, data) => api.patch(`${path}/${id}`, data).then((r) => r.data),
    remove: (id) => api.delete(`${path}/${id}`).then((r) => r.data),
  };
}

export const owners = resource("/owners");
export const units = resource("/units");
export const tenants = resource("/tenants");
export const leases = resource("/leases");
export const payments = resource("/payments");
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --workspace client test`
Expected: PASS (formatters 4, resource 5 = 9 tests).

- [ ] **Step 7: Commit**

```bash
git add client/vitest.config.js client/package.json client/package-lock.json package-lock.json client/src/lib/resource.js client/src/lib/formatters.js client/tests/resource.test.js client/tests/formatters.test.js
git commit -m "feat(client): test harness, resource API factory, PHP/date formatters"
```

> Note: the lockfile may be root-only (`package-lock.json`) in this workspace setup; if `client/package-lock.json` does not exist, drop it from the `git add`.

---

### Task 2: ResourceTable (generic, role-aware)

**Files:**
- Create: `client/src/components/ResourceTable.vue`, `client/tests/ResourceTable.test.js`

**Interfaces:**
- Produces: `ResourceTable` — props `columns: {key,label,format?}[]`, `rows: object[]`, `canWrite: boolean`; emits `edit(row)`, `delete(row)`. Renders an Actions column with `button.edit`/`button.delete` only when `canWrite`.

- [ ] **Step 1: Write the failing test**

`client/tests/ResourceTable.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResourceTable from "../src/components/ResourceTable.vue";

const columns = [{ key: "name", label: "Name" }];
const rows = [{ id: "1", name: "Ayala" }, { id: "2", name: "SM" }];

describe("ResourceTable", () => {
  it("renders one row per record", () => {
    const w = mount(ResourceTable, { props: { columns, rows } });
    expect(w.findAll("tbody tr")).toHaveLength(2);
    expect(w.text()).toContain("Ayala");
  });
  it("hides action buttons when canWrite is false", () => {
    const w = mount(ResourceTable, { props: { columns, rows, canWrite: false } });
    expect(w.find("button.edit").exists()).toBe(false);
  });
  it("shows and emits edit/delete when canWrite", async () => {
    const w = mount(ResourceTable, { props: { columns, rows, canWrite: true } });
    await w.find("button.edit").trigger("click");
    await w.find("button.delete").trigger("click");
    expect(w.emitted("edit")[0][0].id).toBe("1");
    expect(w.emitted("delete")[0][0].id).toBe("1");
  });
  it("applies a column format function", () => {
    const w = mount(ResourceTable, {
      props: { columns: [{ key: "rent", label: "Rent", format: (v) => `PHP ${v}` }],
               rows: [{ id: "1", rent: 100 }] },
    });
    expect(w.text()).toContain("PHP 100");
  });
  it("shows an empty state", () => {
    const w = mount(ResourceTable, { props: { columns, rows: [] } });
    expect(w.text()).toContain("No records.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test ResourceTable`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`client/src/components/ResourceTable.vue`:

```vue
<script setup>
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  canWrite: { type: Boolean, default: false },
});
const emit = defineEmits(["edit", "delete"]);
</script>

<template>
  <table>
    <thead>
      <tr>
        <th v-for="c in columns" :key="c.key">{{ c.label }}</th>
        <th v-if="canWrite">Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td v-for="c in columns" :key="c.key">
          {{ c.format ? c.format(row[c.key]) : row[c.key] }}
        </td>
        <td v-if="canWrite">
          <button type="button" class="edit" @click="emit('edit', row)">Edit</button>
          <button type="button" class="delete" @click="emit('delete', row)">Delete</button>
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td :colspan="canWrite ? columns.length + 1 : columns.length">No records.</td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test ResourceTable`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ResourceTable.vue client/tests/ResourceTable.test.js
git commit -m "feat(client): generic role-aware ResourceTable component"
```

---

### Task 3: ResourceForm (generic, field-schema driven)

**Files:**
- Create: `client/src/components/ResourceForm.vue`, `client/tests/ResourceForm.test.js`

**Interfaces:**
- Produces: `ResourceForm` — props `fields: {key,label,type,options?}[]` (type ∈ `text|email|number|date|select`), `modelValue: object`, `error: string`, `submitting: boolean`; emits `submit(values)`, `cancel`. Seeds inputs from `modelValue`, re-seeding when it changes.

- [ ] **Step 1: Write the failing test**

`client/tests/ResourceForm.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResourceForm from "../src/components/ResourceForm.vue";

const fields = [
  { key: "name", label: "Name", type: "text" },
  { key: "ownerId", label: "Owner", type: "select", options: [{ value: "o1", label: "Ayala" }] },
];

describe("ResourceForm", () => {
  it("renders an input per field, with select options plus a placeholder", () => {
    const w = mount(ResourceForm, { props: { fields } });
    expect(w.find("#name").exists()).toBe(true);
    expect(w.find("#ownerId").exists()).toBe(true);
    expect(w.findAll("#ownerId option")).toHaveLength(2);
  });
  it("seeds from modelValue and emits submit with values", async () => {
    const w = mount(ResourceForm, { props: { fields, modelValue: { name: "SM", ownerId: "o1" } } });
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("submit")[0][0]).toEqual({ name: "SM", ownerId: "o1" });
  });
  it("re-seeds when modelValue changes (edit load)", async () => {
    const w = mount(ResourceForm, { props: { fields, modelValue: {} } });
    await w.setProps({ modelValue: { name: "Later", ownerId: "o1" } });
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("submit")[0][0].name).toBe("Later");
  });
  it("shows an error message", () => {
    const w = mount(ResourceForm, { props: { fields, error: "Bad input" } });
    expect(w.find(".error").text()).toContain("Bad input");
  });
  it("emits cancel", async () => {
    const w = mount(ResourceForm, { props: { fields } });
    await w.find("button.cancel").trigger("click");
    expect(w.emitted("cancel")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test ResourceForm`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`client/src/components/ResourceForm.vue`:

```vue
<script setup>
import { reactive, watch } from "vue";

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, default: () => ({}) },
  error: { type: String, default: "" },
  submitting: { type: Boolean, default: false },
});
const emit = defineEmits(["submit", "cancel"]);

const form = reactive({});
function seed(record) {
  for (const f of props.fields) {
    form[f.key] = record?.[f.key] ?? "";
  }
}
seed(props.modelValue);
watch(() => props.modelValue, seed, { deep: true });

function onSubmit() {
  emit("submit", { ...form });
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div v-for="f in fields" :key="f.key" class="field">
      <label :for="f.key">{{ f.label }}</label>
      <select v-if="f.type === 'select'" :id="f.key" v-model="form[f.key]">
        <option value="">— select —</option>
        <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input v-else :id="f.key" :type="f.type" v-model="form[f.key]" />
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit" :disabled="submitting">Save</button>
    <button type="button" class="cancel" @click="emit('cancel')">Cancel</button>
  </form>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test ResourceForm`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ResourceForm.vue client/tests/ResourceForm.test.js
git commit -m "feat(client): generic field-schema ResourceForm component"
```

---

### Task 4: AppLayout shell + nested routing

**Files:**
- Create: `client/src/components/AppLayout.vue`, `client/tests/AppLayout.test.js`
- Modify: `client/src/router/index.js`, `client/src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `useAuthStore`, `RouterLink`/`RouterView`/`useRouter`.
- Produces: `AppLayout` — nav linking to Dashboard/Owners/Units/Tenants/Leases/Payments, shows `email (role)`, `button.logout` clears the session and routes to `/login`. Router nests all authenticated views as children of `AppLayout` under `/`.

- [ ] **Step 1: Write the failing test**

`client/tests/AppLayout.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import AppLayout from "../src/components/AppLayout.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: stub }, { path: "/login", component: stub },
      { path: "/owners", component: stub }, { path: "/units", component: stub },
      { path: "/tenants", component: stub }, { path: "/leases", component: stub },
      { path: "/payments", component: stub },
    ],
  });
}

describe("AppLayout", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders all nav links", async () => {
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    for (const label of ["Dashboard", "Owners", "Units", "Tenants", "Leases", "Payments"]) {
      expect(w.text()).toContain(label);
    }
  });

  it("logout clears the auth store", async () => {
    const auth = useAuthStore();
    auth.setSession({ token: "t", user: { email: "a@b.c", role: "ADMIN" } });
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    await w.find("button.logout").trigger("click");
    expect(auth.isAuthenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test AppLayout`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`client/src/components/AppLayout.vue`:

```vue
<script setup>
import { RouterLink, RouterView, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();
const links = [
  { to: "/", label: "Dashboard" },
  { to: "/owners", label: "Owners" },
  { to: "/units", label: "Units" },
  { to: "/tenants", label: "Tenants" },
  { to: "/leases", label: "Leases" },
  { to: "/payments", label: "Payments" },
];

function logout() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <div class="layout">
    <nav class="app-nav">
      <RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
      <span class="user">{{ auth.user?.email }} ({{ auth.role }})</span>
      <button type="button" class="logout" @click="logout">Log out</button>
    </nav>
    <main><RouterView /></main>
  </div>
</template>
```

`client/src/views/DashboardView.vue` (replace — layout now owns logout/identity):

```vue
<template>
  <section>
    <h1>Dashboard</h1>
    <p>Welcome to RBU Leasing. Use the navigation to manage records.</p>
    <p>Live metrics arrive in Plan 4.</p>
  </section>
</template>
```

`client/src/router/index.js` (replace — nest authenticated views under `AppLayout`):

```js
import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import AppLayout from "../components/AppLayout.vue";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import OwnersView from "../views/OwnersView.vue";
import OwnerFormView from "../views/OwnerFormView.vue";
import TenantsView from "../views/TenantsView.vue";
import TenantFormView from "../views/TenantFormView.vue";
import UnitsView from "../views/UnitsView.vue";
import UnitFormView from "../views/UnitFormView.vue";
import LeasesView from "../views/LeasesView.vue";
import LeaseFormView from "../views/LeaseFormView.vue";
import PaymentsView from "../views/PaymentsView.vue";
import PaymentFormView from "../views/PaymentFormView.vue";

const routes = [
  { path: "/login", component: LoginView },
  {
    path: "/",
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: "", component: DashboardView },
      { path: "owners", component: OwnersView },
      { path: "owners/new", component: OwnerFormView },
      { path: "owners/:id", component: OwnerFormView },
      { path: "tenants", component: TenantsView },
      { path: "tenants/new", component: TenantFormView },
      { path: "tenants/:id", component: TenantFormView },
      { path: "units", component: UnitsView },
      { path: "units/new", component: UnitFormView },
      { path: "units/:id", component: UnitFormView },
      { path: "leases", component: LeasesView },
      { path: "leases/new", component: LeaseFormView },
      { path: "leases/:id", component: LeaseFormView },
      { path: "payments", component: PaymentsView },
      { path: "payments/new", component: PaymentFormView },
      { path: "payments/:id", component: PaymentFormView },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
});
export default router;
```

> This router imports view files created in Tasks 5–6. Because those tasks come next in sequence, `npm run dev`/`build` will not resolve until Task 6 completes — that is expected. The `AppLayout` unit test in Step 4 does not import the router, so it passes now.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test AppLayout`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AppLayout.vue client/src/router/index.js client/src/views/DashboardView.vue client/tests/AppLayout.test.js
git commit -m "feat(client): AppLayout shell with nav/logout and nested routing"
```

---

### Task 5: Owners + Tenants screens

**Files:**
- Create: `client/src/views/OwnersView.vue`, `client/src/views/OwnerFormView.vue`, `client/src/views/TenantsView.vue`, `client/src/views/TenantFormView.vue`, `client/tests/OwnersView.test.js`, `client/tests/TenantsView.test.js`

**Interfaces:**
- Consumes: `owners`, `tenants` (resource), `ResourceTable`, `ResourceForm`, `useAuthStore`, router.
- Produces: list views that fetch on mount and gate write controls by role; form views that create/edit and route back to the list.

- [ ] **Step 1: Write the failing tests**

`client/tests/OwnersView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  owners: {
    list: vi.fn(() => Promise.resolve([{ id: "1", name: "Ayala", email: "a@x.com", phone: "1" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import OwnersView from "../src/views/OwnersView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/owners", component: OwnersView },
    { path: "/owners/new", component: stub },
    { path: "/owners/:id", component: stub },
  ]});
}

async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/owners"); await router.isReady();
  const w = mount(OwnersView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("OwnersView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists owners from the API", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("Ayala");
  });
  it("shows New for an officer", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).toContain("New owner");
  });
  it("hides New for a viewer", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).not.toContain("New owner");
  });
});
```

`client/tests/TenantsView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  tenants: {
    list: vi.fn(() => Promise.resolve([{ id: "1", name: "Juan", email: "j@x.com", phone: "1" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import TenantsView from "../src/views/TenantsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/tenants", component: TenantsView },
    { path: "/tenants/new", component: stub },
    { path: "/tenants/:id", component: stub },
  ]});
}

async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/tenants"); await router.isReady();
  const w = mount(TenantsView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("TenantsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists tenants from the API", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("Juan");
  });
  it("shows New for an officer", async () => {
    const w = await mountView("ADMIN");
    expect(w.text()).toContain("New tenant");
  });
  it("hides New for a viewer", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).not.toContain("New tenant");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace client test OwnersView TenantsView`
Expected: FAIL — view modules not found.

- [ ] **Step 3: Write the implementations**

`client/src/views/OwnersView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { owners } from "../lib/resource.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const columns = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

async function load() { rows.value = await owners.list(); }
onMounted(load);

function remove(row) {
  if (!confirm(`Delete owner "${row.name}"?`)) return;
  owners.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Owners</h1>
      <button v-if="canWrite" type="button" @click="router.push('/owners/new')">New owner</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/owners/${row.id}`)" @delete="remove" />
  </section>
</template>
```

`client/src/views/OwnerFormView.vue`:

```vue
<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { owners } from "../lib/resource.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const error = ref("");
const submitting = ref(false);
const fields = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "address", label: "Address", type: "text" },
];

onMounted(async () => { if (isEdit) record.value = await owners.get(id); });

async function submit(values) {
  error.value = ""; submitting.value = true;
  try {
    if (isEdit) await owners.update(id, values); else await owners.create(values);
    router.push("/owners");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} owner</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/owners')" />
  </section>
</template>
```

`client/src/views/TenantsView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { tenants } from "../lib/resource.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const columns = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

async function load() { rows.value = await tenants.list(); }
onMounted(load);

function remove(row) {
  if (!confirm(`Delete tenant "${row.name}"?`)) return;
  tenants.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Tenants</h1>
      <button v-if="canWrite" type="button" @click="router.push('/tenants/new')">New tenant</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/tenants/${row.id}`)" @delete="remove" />
  </section>
</template>
```

`client/src/views/TenantFormView.vue`:

```vue
<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { tenants } from "../lib/resource.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const error = ref("");
const submitting = ref(false);
const fields = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "address", label: "Address", type: "text" },
];

onMounted(async () => { if (isEdit) record.value = await tenants.get(id); });

async function submit(values) {
  error.value = ""; submitting.value = true;
  try {
    if (isEdit) await tenants.update(id, values); else await tenants.create(values);
    router.push("/tenants");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} tenant</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/tenants')" />
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace client test OwnersView TenantsView`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/OwnersView.vue client/src/views/OwnerFormView.vue client/src/views/TenantsView.vue client/src/views/TenantFormView.vue client/tests/OwnersView.test.js client/tests/TenantsView.test.js
git commit -m "feat(client): owners and tenants list/form screens"
```

---

### Task 6: Units + Leases + Payments screens (FK dropdowns)

**Files:**
- Create: `client/src/views/UnitsView.vue`, `client/src/views/UnitFormView.vue`, `client/src/views/LeasesView.vue`, `client/src/views/LeaseFormView.vue`, `client/src/views/PaymentsView.vue`, `client/src/views/PaymentFormView.vue`, `client/tests/UnitsView.test.js`, `client/tests/LeasesView.test.js`, `client/tests/PaymentsView.test.js`

**Interfaces:**
- Consumes: `units`, `leases`, `payments`, `owners`, `tenants` (resource), `ResourceTable`, `ResourceForm`, `formatPHP`, `formatDate`, `toDateInput`, `useAuthStore`, router.
- Produces: list views (FK columns shown by id for now) with role-gated writes; form views whose selects are populated from the referenced resources.

- [ ] **Step 1: Write the failing tests**

`client/tests/UnitsView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  units: {
    list: vi.fn(() => Promise.resolve([{ id: "u1", unitNumber: "12A", baseRent: "45000", status: "VACANT" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import UnitsView from "../src/views/UnitsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/units", component: UnitsView },
    { path: "/units/new", component: stub },
    { path: "/units/:id", component: stub },
  ]});
}
async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/units"); await router.isReady();
  const w = mount(UnitsView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("UnitsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists units and formats rent as PHP", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("12A");
    expect(w.text()).toContain("45,000");
  });
  it("shows New for an officer", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).toContain("New unit");
  });
  it("hides New for a viewer", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).not.toContain("New unit");
  });
});
```

`client/tests/LeasesView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  leases: {
    list: vi.fn(() => Promise.resolve([{ id: "l1", unitId: "u1", tenantId: "t1", monthlyRent: "30000", status: "ACTIVE", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import LeasesView from "../src/views/LeasesView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/leases", component: LeasesView },
    { path: "/leases/new", component: stub },
    { path: "/leases/:id", component: stub },
  ]});
}
async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/leases"); await router.isReady();
  const w = mount(LeasesView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("LeasesView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists leases with PHP rent and sliced dates", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("30,000");
    expect(w.text()).toContain("2026-01-01");
  });
  it("shows New for an officer", async () => {
    const w = await mountView("ADMIN");
    expect(w.text()).toContain("New lease");
  });
  it("hides New for a viewer", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).not.toContain("New lease");
  });
});
```

`client/tests/PaymentsView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  payments: {
    list: vi.fn(() => Promise.resolve([{ id: "p1", leaseId: "l1", amount: "30000", status: "PAID", dueDate: "2026-01-05T00:00:00.000Z" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import PaymentsView from "../src/views/PaymentsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/payments", component: PaymentsView },
    { path: "/payments/new", component: stub },
    { path: "/payments/:id", component: stub },
  ]});
}
async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/payments"); await router.isReady();
  const w = mount(PaymentsView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("PaymentsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists payments with PHP amount", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("30,000");
    expect(w.text()).toContain("PAID");
  });
  it("shows New for an officer", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).toContain("New payment");
  });
  it("hides New for a viewer", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).not.toContain("New payment");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace client test UnitsView LeasesView PaymentsView`
Expected: FAIL — view modules not found.

- [ ] **Step 3: Write the implementations**

`client/src/views/UnitsView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const columns = [
  { key: "unitNumber", label: "Unit #" },
  { key: "type", label: "Type" },
  { key: "baseRent", label: "Base rent", format: formatPHP },
  { key: "status", label: "Status" },
];

async function load() { rows.value = await units.list(); }
onMounted(load);

function remove(row) {
  if (!confirm(`Delete unit "${row.unitNumber}"?`)) return;
  units.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Units</h1>
      <button v-if="canWrite" type="button" @click="router.push('/units/new')">New unit</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/units/${row.id}`)" @delete="remove" />
  </section>
</template>
```

`client/src/views/UnitFormView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { units, owners } from "../lib/resource.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const ownerOptions = ref([]);
const error = ref("");
const submitting = ref(false);

const TYPES = ["STUDIO", "ONE_BR", "TWO_BR", "THREE_BR", "OTHER"].map((v) => ({ value: v, label: v }));
const STATUS = ["VACANT", "OCCUPIED"].map((v) => ({ value: v, label: v }));

const fields = computed(() => [
  { key: "ownerId", label: "Owner", type: "select", options: ownerOptions.value },
  { key: "unitNumber", label: "Unit number", type: "text" },
  { key: "building", label: "Building", type: "text" },
  { key: "floor", label: "Floor", type: "text" },
  { key: "type", label: "Type", type: "select", options: TYPES },
  { key: "sizeSqm", label: "Size (sqm)", type: "number" },
  { key: "baseRent", label: "Base rent (PHP)", type: "number" },
  { key: "status", label: "Status", type: "select", options: STATUS },
]);

onMounted(async () => {
  ownerOptions.value = (await owners.list()).map((o) => ({ value: o.id, label: o.name }));
  if (isEdit) record.value = await units.get(id);
});

async function submit(values) {
  error.value = ""; submitting.value = true;
  try {
    if (isEdit) await units.update(id, values); else await units.create(values);
    router.push("/units");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} unit</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/units')" />
  </section>
</template>
```

`client/src/views/LeasesView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { leases } from "../lib/resource.js";
import { formatPHP, formatDate } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const columns = [
  { key: "unitId", label: "Unit ID" },
  { key: "tenantId", label: "Tenant ID" },
  { key: "startDate", label: "Start", format: formatDate },
  { key: "endDate", label: "End", format: formatDate },
  { key: "monthlyRent", label: "Monthly rent", format: formatPHP },
  { key: "status", label: "Status" },
];

async function load() { rows.value = await leases.list(); }
onMounted(load);

function remove(row) {
  if (!confirm("Delete this lease?")) return;
  leases.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Leases</h1>
      <button v-if="canWrite" type="button" @click="router.push('/leases/new')">New lease</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/leases/${row.id}`)" @delete="remove" />
  </section>
</template>
```

`client/src/views/LeaseFormView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { leases, units, tenants } from "../lib/resource.js";
import { toDateInput } from "../lib/formatters.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const unitOptions = ref([]);
const tenantOptions = ref([]);
const error = ref("");
const submitting = ref(false);

const STATUS = ["ACTIVE", "EXPIRED", "TERMINATED"].map((v) => ({ value: v, label: v }));

const fields = computed(() => [
  { key: "unitId", label: "Unit", type: "select", options: unitOptions.value },
  { key: "tenantId", label: "Tenant", type: "select", options: tenantOptions.value },
  { key: "startDate", label: "Start date", type: "date" },
  { key: "endDate", label: "End date", type: "date" },
  { key: "monthlyRent", label: "Monthly rent (PHP)", type: "number" },
  { key: "deposit", label: "Deposit (PHP)", type: "number" },
  { key: "status", label: "Status", type: "select", options: STATUS },
]);

onMounted(async () => {
  unitOptions.value = (await units.list()).map((u) => ({ value: u.id, label: u.unitNumber }));
  tenantOptions.value = (await tenants.list()).map((t) => ({ value: t.id, label: t.name }));
  if (isEdit) {
    const l = await leases.get(id);
    record.value = { ...l, startDate: toDateInput(l.startDate), endDate: toDateInput(l.endDate) };
  }
});

async function submit(values) {
  error.value = ""; submitting.value = true;
  try {
    if (isEdit) await leases.update(id, values); else await leases.create(values);
    router.push("/leases");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} lease</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/leases')" />
  </section>
</template>
```

`client/src/views/PaymentsView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { payments } from "../lib/resource.js";
import { formatPHP, formatDate } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
const columns = [
  { key: "leaseId", label: "Lease ID" },
  { key: "periodMonth", label: "Period", format: formatDate },
  { key: "amount", label: "Amount", format: formatPHP },
  { key: "dueDate", label: "Due", format: formatDate },
  { key: "paidDate", label: "Paid", format: formatDate },
  { key: "status", label: "Status" },
];

async function load() { rows.value = await payments.list(); }
onMounted(load);

function remove(row) {
  if (!confirm("Delete this payment?")) return;
  payments.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Payments</h1>
      <button v-if="canWrite" type="button" @click="router.push('/payments/new')">New payment</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/payments/${row.id}`)" @delete="remove" />
  </section>
</template>
```

`client/src/views/PaymentFormView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { payments, leases } from "../lib/resource.js";
import { toDateInput } from "../lib/formatters.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const leaseOptions = ref([]);
const error = ref("");
const submitting = ref(false);

const STATUS = ["PENDING", "PAID", "OVERDUE"].map((v) => ({ value: v, label: v }));

const fields = computed(() => [
  { key: "leaseId", label: "Lease", type: "select", options: leaseOptions.value },
  { key: "periodMonth", label: "Period month", type: "date" },
  { key: "amount", label: "Amount (PHP)", type: "number" },
  { key: "dueDate", label: "Due date", type: "date" },
  { key: "paidDate", label: "Paid date", type: "date" },
  { key: "status", label: "Status", type: "select", options: STATUS },
  { key: "method", label: "Method", type: "text" },
]);

onMounted(async () => {
  leaseOptions.value = (await leases.list()).map((l) => ({ value: l.id, label: `${l.id.slice(0, 6)} — ${l.status}` }));
  if (isEdit) {
    const p = await payments.get(id);
    record.value = { ...p, periodMonth: toDateInput(p.periodMonth), dueDate: toDateInput(p.dueDate), paidDate: toDateInput(p.paidDate) };
  }
});

async function submit(values) {
  error.value = ""; submitting.value = true;
  const payload = { ...values };
  if (!payload.paidDate) delete payload.paidDate;
  try {
    if (isEdit) await payments.update(id, payload); else await payments.create(payload);
    router.push("/payments");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} payment</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/payments')" />
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace client test UnitsView LeasesView PaymentsView`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full client suite**

Run: `npm --workspace client test`
Expected: PASS — resource 5 + formatters 4 + ResourceTable 5 + ResourceForm 5 + AppLayout 2 + OwnersView 3 + TenantsView 3 + UnitsView 3 + LeasesView 3 + PaymentsView 3 = 36 tests.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/UnitsView.vue client/src/views/UnitFormView.vue client/src/views/LeasesView.vue client/src/views/LeaseFormView.vue client/src/views/PaymentsView.vue client/src/views/PaymentFormView.vue client/tests/UnitsView.test.js client/tests/LeasesView.test.js client/tests/PaymentsView.test.js
git commit -m "feat(client): units, leases, payments list/form screens with FK selects"
```

---

### Task 7: Production build check + full browser walkthrough

**Files:**
- None (verification task).

**Interfaces:**
- Consumes: the whole client + running server. Proves the assembled app builds and the CRUD flow works in a real browser.

- [ ] **Step 1: Verify the client builds (all imports resolve)**

Run: `npm --workspace client run build`
Expected: Vite build succeeds with no unresolved-import errors (confirms the Task 4 router wiring resolves now that all views exist).

- [ ] **Step 2: Start the API and client dev servers**

```bash
npm run dev:server
npm run dev:client
```

Expected: API on :4000, Vite on :5173.

- [ ] **Step 3: Browser walkthrough (admin)**

Log in as `admin@rbu.local` / `admin123`, then via the UI:
1. Owners → New owner → save → owner appears in the list.
2. Units → New unit → pick the owner, fill unit number + base rent → save → appears with PHP-formatted rent.
3. Tenants → New tenant → save.
4. Leases → New lease → pick the unit + tenant, set dates + rent → save.
5. Payments → New payment → pick the lease, set amount + due date + PAID → save → appears with PHP amount.
6. Edit one record and confirm the change persists; delete a payment and confirm it disappears.
7. Attempt to delete the owner that now has a unit → expect the 409 error surfaced via alert.

Expected: every step works; PHP amounts and dates render correctly.

- [ ] **Step 4: Confirm role gating (optional, if a VIEWER user exists)**

Expected: a VIEWER sees lists but no New/Edit/Delete controls.

- [ ] **Step 5: Commit (docs/verification note only, if anything changed)**

No code changes expected. If Steps 1–4 surface a bug, fix it under TDD (add a failing test first) before completing the plan.

---

## Self-Review

**Spec coverage (this plan's slice):** Spec build-order item 3 — "Vue screens for owners, units, tenants, leases, payments" — all five entities get list + create/edit/delete screens (Tasks 5–6) ✓. Role-based UI hiding (spec: "frontend hides/disables actions the role can't perform") — `canWrite` gate on every list, tested per entity ✓. PHP currency formatting (spec non-goal is multi-currency; PHP assumed) ✓. Reuses the existing Axios instance + auth store + guarded routing ✓. Dashboard/summary/reports correctly excluded (Plans 4–6) ✓.

**Placeholder scan:** No TBD/TODO. Every code step contains complete components. Task 4 explicitly notes the router references views built in Tasks 5–6 (expected transient unresolved import until Task 6; the AppLayout unit test doesn't import the router, so it's green at Task 4).

**Type consistency:** `resource(path)` returns `{list,get,create,update,remove}` — every view uses those names. `ResourceTable` props `columns/rows/canWrite` + events `edit/delete` — used identically in all five list views. `ResourceForm` props `fields/modelValue/error/submitting` + events `submit/cancel` — used identically in all five form views. Field `type` values (`text|email|number|date|select`) all handled by `ResourceForm`. Money columns use `formatPHP`; date columns use `formatDate`; date inputs seed via `toDateInput`. Auth gate uses `auth.role` (Plan 1 getter) consistently.

**Test count:** resource 5 + formatters 4 + ResourceTable 5 + ResourceForm 5 + AppLayout 2 + OwnersView 3 + TenantsView 3 + UnitsView 3 + LeasesView 3 + PaymentsView 3 = **36 client tests** at the end of Task 6. Server suite (45) is unchanged.

## Later Plans (preview)

- **Plan 4 — Dashboard metrics:** occupancy, income, expiring windows, overdue/outstanding, new-this-month, counts — service functions + API + Vue dashboard, computed from this data.
- **Plan 5 — Executive Summary:** period selection + prior-period comparison.
- **Plan 6 — Excel reports:** rent roll, collections, lease expiry, owner statement via ExcelJS.
- **Plan 7 — Hardening:** token persistence, pagination, richer validation, FK labels in list views (show owner/tenant names instead of IDs), polish.
