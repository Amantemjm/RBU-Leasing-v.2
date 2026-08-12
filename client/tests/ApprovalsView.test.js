import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

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
import { approveUnit } from "../src/lib/resource.js";

describe("ApprovalsView", () => {
  beforeEach(() => { approveUnit.mockClear(); });

  it("lists pending units read-only in the main nav (no actions)", async () => {
    const w = mount(ApprovalsView);
    await flushPromises();
    expect(w.text()).toContain("P1");
    expect(w.text()).toContain("Ayala");
    expect(w.findAll("button").some((b) => b.text() === "Approve")).toBe(false);
  });

  it("approves a unit in the Master Admin hub (admin)", async () => {
    const w = mount(ApprovalsView, { props: { admin: true } });
    await flushPromises();
    const btn = w.findAll("button").find((b) => b.text() === "Approve");
    await btn.trigger("click");
    await flushPromises();
    expect(approveUnit).toHaveBeenCalledWith("u1");
  });
});
