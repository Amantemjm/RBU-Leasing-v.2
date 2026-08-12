import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  listInquiries: vi.fn(() => Promise.resolve([
    { id: "i1", category: "RESIDENCES", fullName: "Maria Santos", email: "maria@example.com",
      message: "Interested in a 2BR", status: "NEW", createdAt: "2026-08-12T00:00:00Z" },
  ])),
  updateInquiryStatus: vi.fn(() => Promise.resolve({ id: "i1", status: "IN_PROGRESS" })),
  deleteInquiry: vi.fn(() => Promise.resolve()),
}));

import InquiriesView from "../src/views/InquiriesView.vue";
import { useAuthStore } from "../src/stores/auth.js";
import { updateInquiryStatus, deleteInquiry } from "../src/lib/inquiries.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(InquiriesView);
}

describe("InquiriesView (staff)", () => {
  beforeEach(() => { updateInquiryStatus.mockClear(); deleteInquiry.mockClear(); });

  it("lists inquiries with category and email", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.text()).toContain("Maria Santos");
    expect(w.text()).toContain("Residences");
    expect(w.text()).toContain("maria@example.com");
  });

  it("is read-only for a viewer (no status select, no delete)", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.find("select.status").exists()).toBe(false);
    expect(w.findAll("button").some((b) => b.text() === "Delete")).toBe(false);
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
