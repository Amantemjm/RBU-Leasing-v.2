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
