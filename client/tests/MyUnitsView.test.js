import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  units: {
    list: vi.fn(() => Promise.resolve([
      { id: "u1", unitNumber: "14H", baseRent: "45000", status: "OCCUPIED", approvalStatus: "APPROVED", tower: { name: "Viridian in Greenhills" } },
    ])),
  },
}));

import MyUnitsView from "../src/views/MyUnitsView.vue";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/my-units", component: MyUnitsView },
    { path: "/register-unit", component: stub },
  ] });
}

describe("MyUnitsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists the owner's units with tower and approval status", async () => {
    const router = makeRouter(); router.push("/my-units"); await router.isReady();
    const w = mount(MyUnitsView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain("14H");
    expect(w.text()).toContain("Viridian in Greenhills");
    expect(w.text()).toContain("APPROVED");
    expect(w.text()).toContain("Register a unit");
  });
});
