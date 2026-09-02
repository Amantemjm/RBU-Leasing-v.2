import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/requirements.js", () => ({
  listRequirements: vi.fn(() => Promise.resolve([
    { id: "r1", filename: "id.pdf", size: 2048, uploadedAt: "2026-08-11T00:00:00Z", tenant: { name: "Juan" } },
  ])),
  uploadRequirement: vi.fn(() => Promise.resolve()),
  downloadRequirement: vi.fn(() => Promise.resolve()),
}));
// The Lessor tab pulls the owners list; stub it so the hub mounts cleanly.
vi.mock("../src/lib/resource.js", () => ({
  owners: { list: vi.fn(() => Promise.resolve([{ id: "o1", name: "Ayala" }])) },
  lessorRequirements: { forOwner: vi.fn(() => Promise.resolve([])), review: vi.fn(), uploadFor: vi.fn(), download: vi.fn() },
}));

import RequirementsView from "../src/views/RequirementsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

function mountAs(role, tenantId) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role, tenantId } });
  return mount(RequirementsView);
}

describe("RequirementsView (module)", () => {
  it("a tenant sees only their own upload control and documents (no tabs)", async () => {
    const w = mountAs("TENANT", "t1");
    await flushPromises();
    expect(w.find('input[type="file"]').exists()).toBe(true);
    expect(w.text()).toContain("id.pdf");
    expect(w.findAll("button").some((b) => b.text() === "Lessor")).toBe(false);
  });

  it("staff get Lessor and Lessee tabs, Lessor first", async () => {
    const w = mountAs("ADMIN", null);
    await flushPromises();
    const tabs = w.findAll("button").filter((b) => b.text() === "Lessor" || b.text() === "Lessee");
    expect(tabs.length).toBe(2);
    // default Lessor tab → the lessor owner picker, not the tenant table
    expect(w.find("select.owner-picker").exists()).toBe(true);
  });

  it("the Lessee tab shows the tenant documents table", async () => {
    const w = mountAs("ADMIN", null);
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "Lessee").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Tenant");
    expect(w.text()).toContain("id.pdf");
    expect(w.find('input[type="file"]').exists()).toBe(false);
  });
});
