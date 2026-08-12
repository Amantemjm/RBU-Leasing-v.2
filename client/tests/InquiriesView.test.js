import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  listInquiries: vi.fn(() => Promise.resolve([
    { id: "i1", category: "RESIDENCES", fullName: "Maria Santos", email: "maria@example.com",
      message: "Interested in a 2BR", assignedToId: null, assignedTo: null,
      createdAt: "2026-08-12T00:00:00Z" },
  ])),
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
import { deleteInquiry, assignInquiry } from "../src/lib/inquiries.js";
import { listUsers } from "../src/lib/resource.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(InquiriesView);
}

describe("InquiriesView (staff)", () => {
  beforeEach(() => { deleteInquiry.mockClear(); assignInquiry.mockClear(); listUsers.mockClear(); });

  it("lists inquiries and has no Status column", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.text()).toContain("Maria Santos");
    expect(w.text()).toContain("Residences");
    const headers = w.findAll("th").map((h) => h.text());
    expect(headers).not.toContain("Status");
    expect(headers).toContain("Assigned to");
  });

  it("is read-only for a viewer (no assign control, no delete)", async () => {
    const w = mountAs("VIEWER");
    await flushPromises();
    expect(w.find(".ss").exists()).toBe(false);
    expect(w.findAll("button").some((b) => b.text() === "Delete")).toBe(false);
  });

  it("an O-Lease cannot reassign but can delete their own", async () => {
    const w = mountAs("LEASING_OFFICER");
    await flushPromises();
    expect(w.find(".ss").exists()).toBe(false); // only Super Admin assigns
    expect(listUsers).not.toHaveBeenCalled();
    expect(w.findAll("button").some((b) => b.text() === "Delete")).toBe(true);
  });

  it("lets a Super Admin search and assign an O-Lease", async () => {
    const w = mountAs("ADMIN");
    await flushPromises();
    expect(w.find(".ss").exists()).toBe(true);
    await w.find(".ss__btn").trigger("click");
    await w.find(".ss__search").setValue("jane");
    const options = w.findAll(".ss__opt").filter((b) => !b.classes("clear")).map((b) => b.text());
    expect(options).toEqual(["Officer Jane"]);
    await w.findAll(".ss__opt").find((b) => b.text() === "Officer Jane").trigger("click");
    await flushPromises();
    expect(assignInquiry).toHaveBeenCalledWith("i1", "o1");
  });
});
