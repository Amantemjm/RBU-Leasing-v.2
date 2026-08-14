import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/resource.js", () => ({
  units: {
    list: vi.fn(() => Promise.resolve([
      { id: "u1", unitNumber: "P1", baseRent: "30000", tower: { name: "Maven at Capitol Commons" }, owner: { name: "Ayala" } },
    ])),
  },
  approveUnit: vi.fn(() => Promise.resolve()),
  rejectUnit: vi.fn(() => Promise.resolve()),
}));

import ApprovalsView from "../src/views/ApprovalsView.vue";
import { useAuthStore } from "../src/stores/auth.js";
import { approveUnit } from "../src/lib/resource.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(ApprovalsView);
}

describe("ApprovalsView", () => {
  beforeEach(() => { approveUnit.mockClear(); });

  it("lists pending units read-only for a non-admin (no actions)", async () => {
    const w = mountAs("LEASING_OFFICER");
    await flushPromises();
    expect(w.text()).toContain("P1");
    expect(w.text()).toContain("Ayala");
    expect(w.findAll("button").some((b) => b.text() === "Approve")).toBe(false);
  });

  it("lets the Super Admin approve a unit", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    const btn = w.findAll("button").find((b) => b.text() === "Approve");
    await btn.trigger("click");
    await flushPromises();
    expect(approveUnit).toHaveBeenCalledWith("u1");
  });
});
