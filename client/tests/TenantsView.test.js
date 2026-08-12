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

async function mountView(role, admin = false) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/tenants"); await router.isReady();
  const w = mount(TenantsView, { global: { plugins: [router] }, props: { admin } });
  await flushPromises();
  return w;
}

describe("TenantsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists tenants from the API", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("Juan");
  });
  it("shows write controls in the Master Admin hub (admin)", async () => {
    const w = await mountView("ADMIN", true);
    expect(w.text()).toContain("New tenant");
  });
  it("is read-only in the main nav even for a write role", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).not.toContain("New tenant");
  });
});
