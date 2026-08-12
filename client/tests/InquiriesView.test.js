import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  listInquiries: vi.fn(() => Promise.resolve([
    { id: "i1", category: "RESIDENCES", fullName: "Maria Santos", email: "maria@example.com",
      message: "Interested in a 2BR", status: "NEW", assignedToId: null, assignedTo: null,
      createdAt: "2026-08-12T00:00:00Z" },
  ])),
  updateInquiryStatus: vi.fn(() => Promise.resolve({ id: "i1", status: "IN_PROGRESS" })),
  deleteInquiry: vi.fn(() => Promise.resolve()),
  assignInquiry: vi.fn(() => Promise.resolve({ id: "i1", assignedToId: "o1", assignedTo: { id: "o1", name: "Officer Jane" } })),
}));

vi.mock("../src/lib/resource.js", () => ({
  listUsers: vi.fn(() => Promise.resolve([
    { id: "o1", name: "Officer Jane", role: "LEASING_OFFICER" },
    { id: "v1", name: "Val Viewer", role: "VIEWER" },
  ])),
}));

import InquiriesView from "../src/views/InquiriesView.vue";
import { useAuthStore } from "../src/stores/auth.js";
import { updateInquiryStatus, deleteInquiry, assignInquiry } from "../src/lib/inquiries.js";
import { listUsers } from "../src/lib/resource.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(InquiriesView);
}

describe("InquiriesView (staff)", () => {
  beforeEach(() => { updateInquiryStatus.mockClear(); deleteInquiry.mockClear(); assignInquiry.mockClear(); listUsers.mockClear(); });

  it("lists inquiries with category and email", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.text()).toContain("Maria Santos");
    expect(w.text()).toContain("Residences");
    expect(w.text()).toContain("maria@example.com");
  });

  it("is read-only for a viewer (no status/assignee select, no delete)", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.find("select.status").exists()).toBe(false);
    expect(w.find("select.assignee").exists()).toBe(false);
    expect(w.findAll("button").some((b) => b.text() === "Delete")).toBe(false);
  });

  it("only an admin can assign to an O-Lease", async () => {
    const officer = mountAs("LEASING_OFFICER");
    await flushPromises();
    expect(officer.find("select.assignee").exists()).toBe(false); // officers change status, not assignment
    expect(listUsers).not.toHaveBeenCalled();

    const admin = mountAs("ADMIN");
    await flushPromises();
    const select = admin.find("select.assignee");
    expect(select.exists()).toBe(true);
    // only O-Lease users are offered (plus the Unassigned option)
    const opts = select.findAll("option").map((o) => o.text());
    expect(opts).toEqual(["— Unassigned —", "Officer Jane"]);
    await select.setValue("o1");
    expect(assignInquiry).toHaveBeenCalledWith("i1", "o1");
  });

  it("lets a write role change status and delete", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const w = mountAs("LEASING_OFFICER");
    await flushPromises();
    await w.find("select.status").setValue("IN_PROGRESS");
    expect(updateInquiryStatus).toHaveBeenCalledWith("i1", "IN_PROGRESS");
    await w.findAll("button").find((b) => b.text() === "Delete").trigger("click");
    await flushPromises();
    expect(deleteInquiry).toHaveBeenCalledWith("i1");
    vi.unstubAllGlobals();
  });
});
