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
import { units, approveUnit, rejectUnit } from "../src/lib/resource.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(ApprovalsView);
}

const btnLabelled = (w, label) => w.findAll("button").find((b) => b.text() === label);

describe("ApprovalsView", () => {
  beforeEach(() => {
    units.list.mockClear();
    approveUnit.mockClear();
    rejectUnit.mockClear();
  });

  it("lists submitted units read-only for a non-admin (no actions)", async () => {
    const w = mountAs("LEASING_OFFICER");
    await flushPromises();
    expect(w.text()).toContain("P1");
    expect(w.text()).toContain("Ayala");
    expect(w.findAll("button").some((b) => b.text() === "Approve")).toBe(false);
  });

  it("loads the queue filtered to Submitted units", async () => {
    mountAs("ADMIN");
    await flushPromises();
    expect(units.list).toHaveBeenCalledWith({ approvalStatus: "SUBMITTED" });
  });

  it("lets the Super Admin approve a unit", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    await btnLabelled(w, "Approve").trigger("click");
    await flushPromises();
    expect(approveUnit).toHaveBeenCalledWith("u1");
  });

  // Rejection needs a remark, so it must not fire straight from the row.
  it("does not reject straight from the row", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    await btnLabelled(w, "Reject").trigger("click");
    await flushPromises();
    expect(rejectUnit).not.toHaveBeenCalled();
    expect(w.find(".modal").exists()).toBe(true);
  });

  it("requires a remark before rejecting", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    await btnLabelled(w, "Reject").trigger("click");
    await btnLabelled(w.find(".modal"), "Reject unit").trigger("click");
    await flushPromises();
    expect(rejectUnit).not.toHaveBeenCalled();
    expect(w.find(".modal .error").text()).toBeTruthy();
  });

  it("rejects with the remark once given", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    await btnLabelled(w, "Reject").trigger("click");
    await w.find(".modal input").setValue("Missing floor plan");
    await btnLabelled(w.find(".modal"), "Reject unit").trigger("click");
    await flushPromises();
    expect(rejectUnit).toHaveBeenCalledWith("u1", "Missing floor plan");
  });
});
