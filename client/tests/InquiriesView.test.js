import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  listInquiries: vi.fn(() => Promise.resolve([
    { id: "i1", category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
      fullName: "Maria Santos", email: "maria@example.com",
      message: "Interested in a 2BR", assignedToId: null, assignedTo: null,
      status: "NEW", createdAt: "2026-08-12T00:00:00Z" },
    { id: "i2", category: "OFFICES", inquirerType: "LESSOR", inquiryType: "Listing",
      fullName: "Pedro Cruz", email: "pedro@example.com",
      message: "Signed up as a lessor", assignedToId: null, assignedTo: null,
      status: "CONVERTED", createdAt: "2026-08-13T00:00:00Z" },
  ])),
  deleteInquiry: vi.fn(() => Promise.resolve()),
  assignInquiry: vi.fn(() => Promise.resolve({ id: "i1", assignedToId: "o1", assignedTo: { id: "o1", name: "Officer Jane" } })),
  acceptInquiry: vi.fn(() => Promise.resolve({ id: "i1", assignedToId: "me", assignedTo: { id: "me", name: "Me" } })),
  releaseInquiry: vi.fn(() => Promise.resolve({ id: "i1", assignedToId: null, assignedTo: null })),
}));

vi.mock("../src/lib/resource.js", () => ({
  listUsers: vi.fn(() => Promise.resolve([
    { id: "o1", name: "Officer Jane", role: "LEASING_OFFICER" },
    { id: "v1", name: "Val Viewer", role: "VIEWER" },
  ])),
}));

import InquiriesView from "../src/views/InquiriesView.vue";
import { useAuthStore } from "../src/stores/auth.js";
import { deleteInquiry, assignInquiry, acceptInquiry } from "../src/lib/inquiries.js";
import { listUsers } from "../src/lib/resource.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(InquiriesView);
}

describe("InquiriesView (staff)", () => {
  beforeEach(() => { deleteInquiry.mockClear(); assignInquiry.mockClear(); listUsers.mockClear(); });

  it("lists inquiries with I-am-a and Inquiry Type columns", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.text()).toContain("Maria Santos");
    expect(w.text()).toContain("Residences");
    expect(w.text()).toContain("Lessee");
    expect(w.text()).toContain("Unit Availability");
    const headers = w.findAll("th").map((h) => h.text());
    expect(headers).toContain("I am a");
    expect(headers).toContain("Inquiry Type");
    expect(headers).toContain("Assigned to");
    expect(headers).toContain("Status");
  });

  it("renders a Converted badge for a converted inquiry and a New badge for a new one", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    const tags = w.findAll(".status-tag").map((t) => t.text());
    expect(tags).toContain("Converted");
    expect(tags).toContain("New");
    expect(w.find(".status-tag.converted").exists()).toBe(true);
  });

  it("is read-only for a viewer (no assign control, no delete)", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.find(".ss").exists()).toBe(false);
    expect(w.findAll("button").some((b) => b.text() === "Delete")).toBe(false);
  });

  it("an O-Lease sees no admin assign dropdown, but can Accept an unassigned inquiry", async () => {
    const w = mountAs("LEASING_OFFICER");
    await flushPromises();
    expect(w.find("select.assign-select").exists()).toBe(false); // only Super Admin assigns
    expect(listUsers).not.toHaveBeenCalled();
    const accept = w.findAll("button").find((b) => b.text() === "Accept");
    expect(accept).toBeTruthy();
    await accept.trigger("click");
    await flushPromises();
    expect(acceptInquiry).toHaveBeenCalledWith("i1");
  });

  it("lets a Super Admin assign an O-Lease via a plain dropdown (no search)", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    const sel = w.find("select.assign-select");
    expect(sel.exists()).toBe(true);
    expect(w.find(".ss").exists()).toBe(false); // no searchable-select
    const opts = sel.findAll("option").map((o) => o.text());
    expect(opts).toEqual(["Unassigned", "Officer Jane"]); // Val Viewer is filtered out
    await sel.setValue("o1");
    await flushPromises();
    expect(assignInquiry).toHaveBeenCalledWith("i1", "o1");
  });
});
