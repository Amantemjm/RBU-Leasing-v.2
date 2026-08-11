import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/requirements.js", () => ({
  listRequirements: vi.fn(() => Promise.resolve([
    { id: "r1", filename: "id.pdf", size: 2048, uploadedAt: "2026-08-11T00:00:00Z", tenant: { name: "Juan" } },
  ])),
  uploadRequirement: vi.fn(() => Promise.resolve()),
  downloadRequirement: vi.fn(() => Promise.resolve()),
}));

import RequirementsView from "../src/views/RequirementsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

function mountAs(role, tenantId) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role, tenantId } });
  return mount(RequirementsView);
}

describe("RequirementsView", () => {
  it("tenant sees an upload control and their documents", async () => {
    const w = mountAs("TENANT", "t1");
    await flushPromises();
    expect(w.find('input[type="file"]').exists()).toBe(true);
    expect(w.text()).toContain("id.pdf");
  });
  it("staff see a Tenant column and no upload control", async () => {
    const w = mountAs("ADMIN", null);
    await flushPromises();
    expect(w.find('input[type="file"]').exists()).toBe(false);
    expect(w.text()).toContain("Tenant");
  });
});
