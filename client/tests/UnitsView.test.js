import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  units: {
    list: vi.fn(() => Promise.resolve([
      { id: "u1", unitNumber: "12A", baseRent: "45000", status: "VACANT",
        tower: { id: "t1", name: "Tower One", estate: { id: "e1", name: "Estate Alpha" } } },
      { id: "u2", unitNumber: "7B", baseRent: "30000", status: "OCCUPIED",
        tower: { id: "t2", name: "Tower Two", estate: { id: "e2", name: "Estate Beta" } } },
    ])),
    remove: vi.fn(() => Promise.resolve()),
  },
  estates: {
    list: vi.fn(() => Promise.resolve([
      { id: "e1", name: "Estate Alpha", towers: [{ id: "t1", name: "Tower One" }] },
      { id: "e2", name: "Estate Beta", towers: [{ id: "t2", name: "Tower Two" }] },
    ])),
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
async function mountView(role, admin = false) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/units"); await router.isReady();
  const w = mount(UnitsView, { global: { plugins: [router] }, props: { admin } });
  await flushPromises();
  return w;
}

describe("UnitsView", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows a single table with Estate and Tower columns", async () => {
    const w = await mountView("VIEWER");
    const headers = w.findAll("th").map((h) => h.text());
    expect(headers).toContain("Estate");
    expect(headers).toContain("Tower");
    // both estates' units are consolidated into one table
    expect(w.findAll("table").length).toBe(1);
    expect(w.text()).toContain("12A");
    expect(w.text()).toContain("Estate Alpha");
    expect(w.text()).toContain("Tower One");
    expect(w.text()).toContain("7B");
    expect(w.text()).toContain("Estate Beta");
  });

  it("formats rent as PHP", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("45,000");
  });

  it("filters the table by a selected estate (multi-select)", async () => {
    const w = await mountView("VIEWER");
    const estateBtn = w.findAll(".ms__btn").find((b) => b.text().includes("Estate:"));
    await estateBtn.trigger("click");
    const alpha = w.findAll(".ms__opt").find((l) => l.text() === "Estate Alpha");
    await alpha.find("input").setValue(true);
    await flushPromises();
    const bodyText = w.find("tbody").text();
    expect(bodyText).toContain("12A");
    expect(bodyText).not.toContain("7B");
  });

  it("shows write controls in the Master Admin hub (admin)", async () => {
    const w = await mountView("ADMIN", true);
    expect(w.text()).toContain("New unit");
  });
  it("is read-only in the main nav even for a write role", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).not.toContain("New unit");
  });
});
