import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const ROWS = [
  { id: "a1", name: "Ana Reyes", email: "ana.reyes", contactEmail: "ana@example.com", role: "TENANT", createdAt: "2026-08-25T00:00:00Z" },
  { id: "b2", name: "Juan Cruz", email: "juan.owner", contactEmail: "juan@example.com", role: "UNIT_OWNER", createdAt: "2026-08-26T00:00:00Z" },
];

vi.mock("../src/lib/resource.js", () => ({
  pendingAccounts: {
    list: vi.fn(() => Promise.resolve(ROWS)),
    approve: vi.fn(() => Promise.resolve({})),
    reject: vi.fn(() => Promise.resolve({})),
  },
}));

import AccountApprovalsView from "../src/views/AccountApprovalsView.vue";
import { pendingAccounts } from "../src/lib/resource.js";

async function mountView() {
  const w = mount(AccountApprovalsView);
  await flushPromises();
  return w;
}
const btnIn = (row, label) => row.findAll("button").find((b) => b.text() === label);

describe("AccountApprovalsView", () => {
  beforeEach(() => {
    // The view syncs the top-bar indicator, so it needs a live pinia.
    setActivePinia(createPinia());
    pendingAccounts.list.mockClear();
    pendingAccounts.approve.mockClear();
    pendingAccounts.reject.mockClear();
    pendingAccounts.list.mockResolvedValue(ROWS);
  });

  it("lists the applications with the details needed to vet them", async () => {
    const w = await mountView();
    expect(pendingAccounts.list).toHaveBeenCalled();
    const text = w.text();
    expect(text).toContain("Ana Reyes");
    expect(text).toContain("ana@example.com"); // approver must be able to make contact
    expect(text).toContain("Juan Cruz");
  });

  it("approves an application and reloads the queue", async () => {
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "Approve").trigger("click");
    await flushPromises();
    expect(pendingAccounts.approve).toHaveBeenCalledWith("a1");
    expect(pendingAccounts.list).toHaveBeenCalledTimes(2);
  });

  // Rejection is not reversible from this screen, so it must not fire on one click.
  it("does not reject straight from the row", async () => {
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "Reject").trigger("click");
    await flushPromises();
    expect(pendingAccounts.reject).not.toHaveBeenCalled();
    expect(w.find(".modal").exists()).toBe(true);
  });

  it("requires a reason before rejecting", async () => {
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "Reject").trigger("click");
    await btnIn(w.find(".modal"), "Reject account").trigger("click");
    await flushPromises();
    expect(pendingAccounts.reject).not.toHaveBeenCalled();
    expect(w.find(".modal .error").text()).toContain("reason");
  });

  it("rejects with the reason once given", async () => {
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "Reject").trigger("click");
    await w.find("#reason").setValue("Could not verify identity");
    await btnIn(w.find(".modal"), "Reject account").trigger("click");
    await flushPromises();
    expect(pendingAccounts.reject).toHaveBeenCalledWith("a1", "Could not verify identity");
  });

  it("says so plainly when nothing is waiting", async () => {
    pendingAccounts.list.mockResolvedValue([]);
    const w = await mountView();
    expect(w.text()).toContain("No accounts are waiting for approval.");
    expect(w.find("tbody").exists()).toBe(false);
  });

  it("surfaces a load failure instead of showing an empty queue", async () => {
    pendingAccounts.list.mockRejectedValue({ response: { data: { error: "Forbidden" } } });
    const w = await mountView();
    expect(w.find(".error").text()).toBe("Forbidden");
  });
});
