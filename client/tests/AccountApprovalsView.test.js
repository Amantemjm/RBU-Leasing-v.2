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
    revise: vi.fn(() => Promise.resolve({})),
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
    pendingAccounts.revise.mockClear();
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

  // The application row is kept (not deleted) so the applicant can be told
  // why, and the username is never freed — a genuine re-application needs an
  // officer to reopen the account. The modal must not claim the opposite.
  it("describes reject accurately: kept on file, username stays taken", async () => {
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "Reject").trigger("click");
    const modalText = w.find(".modal").text();
    expect(modalText).not.toContain("permanently removes the request");
    expect(modalText).not.toContain("username is freed");
    expect(modalText).toMatch(/kept/i);
    expect(modalText).toMatch(/username.*(taken|stays)/i);
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

  // The approver should see what unit a lessor is claiming before deciding.
  it("shows the unit a lessor applied with, and nothing when they skipped", async () => {
    pendingAccounts.list.mockResolvedValue([
      { id: "u1", name: "Maria Santos", email: "m.santos", contactEmail: "m@x.com", role: "UNIT_OWNER",
        createdAt: new Date().toISOString(), pendingUnit: { unitNumber: "19A" } },
      { id: "u2", name: "Ana Garcia", email: "a.garcia", contactEmail: "a@x.com", role: "TENANT",
        createdAt: new Date().toISOString(), pendingUnit: null },
    ]);
    const w = await mountView();
    await flushPromises();
    const rows = w.findAll("tbody tr");
    expect(rows[0].text()).toContain("19A");
    expect(rows[1].find(".pending-unit").exists()).toBe(false);
  });

  // For Revision sends an application back to the applicant with remarks,
  // rather than rejecting it outright.
  it("offers a For Revision action beside approve and reject", async () => {
    pendingAccounts.list.mockResolvedValue([
      { id: "u1", name: "Jane", email: "jane", role: "UNIT_OWNER",
        createdAt: new Date().toISOString(), pendingUnit: { unitNumber: "19A" } },
    ]);
    const w = await mountView();
    expect(w.text()).toContain("For Revision");
  });

  it("sends the remarks with the revision", async () => {
    pendingAccounts.list.mockResolvedValue([
      { id: "u1", name: "Jane", email: "jane", role: "UNIT_OWNER",
        createdAt: new Date().toISOString(), pendingUnit: { unitNumber: "19A" } },
    ]);
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "For Revision").trigger("click");
    await w.get('[data-test="revise-remarks"]').setValue("Tower does not match");
    await w.get('[data-test="revise-confirm"]').trigger("click");
    await flushPromises();
    expect(pendingAccounts.revise).toHaveBeenCalledWith("u1", "Tower does not match");
  });

  // A TENANT application has no pendingUnit, and the only escape hatch
  // (resubmission) requires a unit from a UNIT_OWNER only — offering For
  // Revision on a lessee row would send them somewhere they can't get out of.
  it("does not offer For Revision on a lessee row, only approve and reject", async () => {
    pendingAccounts.list.mockResolvedValue([
      { id: "t1", name: "Tenant Applicant", email: "tenant1", role: "TENANT",
        createdAt: new Date().toISOString(), pendingUnit: null },
    ]);
    const w = await mountView();
    const row = w.findAll("tbody tr")[0];
    const labels = row.findAll("button").map((b) => b.text());
    expect(labels).toEqual(["Approve", "Reject"]);
  });

  it("still offers For Revision on a lessor row", async () => {
    pendingAccounts.list.mockResolvedValue([
      { id: "o1", name: "Owner Applicant", email: "owner1", role: "UNIT_OWNER",
        createdAt: new Date().toISOString(), pendingUnit: { unitNumber: "19A" } },
    ]);
    const w = await mountView();
    const row = w.findAll("tbody tr")[0];
    const labels = row.findAll("button").map((b) => b.text());
    expect(labels).toEqual(["Approve", "For Revision", "Reject"]);
  });

  it("will not send an empty revision remark", async () => {
    pendingAccounts.list.mockResolvedValue([
      { id: "u1", name: "Jane", email: "jane", role: "UNIT_OWNER",
        createdAt: new Date().toISOString(), pendingUnit: { unitNumber: "19A" } },
    ]);
    const w = await mountView();
    await btnIn(w.findAll("tbody tr")[0], "For Revision").trigger("click");
    await w.get('[data-test="revise-confirm"]').trigger("click");
    await flushPromises();
    expect(pendingAccounts.revise).not.toHaveBeenCalled();
  });
});
