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
