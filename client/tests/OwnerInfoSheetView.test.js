import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const REQUESTED = {
  id: "s1", status: "REQUESTED",
  fullName: "", email: "", mobile: "", bankName: "", accountName: "", accountNumber: "",
};

vi.mock("../src/lib/infoSheets.js", () => ({
  listInfoSheets: vi.fn(() => Promise.resolve([{ ...REQUESTED }])),
  submitInfoSheet: vi.fn((id, data) => Promise.resolve({ id, status: "SUBMITTED", ...data })),
}));

import OwnerInfoSheetView from "../src/views/OwnerInfoSheetView.vue";
import { listInfoSheets, submitInfoSheet } from "../src/lib/infoSheets.js";

describe("OwnerInfoSheetView", () => {
  beforeEach(() => { submitInfoSheet.mockClear(); });

  it("renders an editable form when the sheet is REQUESTED and submits it", async () => {
    const w = mount(OwnerInfoSheetView);
    await flushPromises();
    expect(w.find("#fullName").exists()).toBe(true);
    const submit = () => w.find('button[type="submit"]');
    expect(submit().attributes("disabled")).toBeDefined(); // required fields empty

    await w.find("#fullName").setValue("Juan Dela Cruz");
    await w.find("#email").setValue("juan@example.com");
    await w.find("#mobile").setValue("09170000000");
    await w.find("#bankName").setValue("BDO");
    await w.find("#accountName").setValue("Juan Dela Cruz");
    await w.find("#accountNumber").setValue("0011223344");
    expect(submit().attributes("disabled")).toBeUndefined();

    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(submitInfoSheet).toHaveBeenCalledWith("s1", expect.objectContaining({
      fullName: "Juan Dela Cruz", email: "juan@example.com", accountNumber: "0011223344",
    }));
    // switches to read-only after submit
    expect(w.find("#fullName").exists()).toBe(false);
  });

  it("shows a read-only view when SUBMITTED", async () => {
    listInfoSheets.mockResolvedValueOnce([{ id: "s2", status: "SUBMITTED", fullName: "Maria", email: "m@x.com", submittedAt: "2026-08-12T00:00:00Z" }]);
    const w = mount(OwnerInfoSheetView);
    await flushPromises();
    expect(w.find("#fullName").exists()).toBe(false);
    expect(w.text()).toContain("Maria");
    expect(w.text()).toContain("Submitted");
  });

  it("shows the return remarks and an editable form when RETURNED", async () => {
    listInfoSheets.mockResolvedValueOnce([{ id: "s3", status: "RETURNED", remarks: "Fix bank details", fullName: "Maria", email: "", mobile: "", bankName: "", accountName: "", accountNumber: "" }]);
    const w = mount(OwnerInfoSheetView);
    await flushPromises();
    expect(w.text()).toContain("Fix bank details");
    expect(w.find("#fullName").exists()).toBe(true);
  });

  it("shows an empty state when no sheet has been requested", async () => {
    listInfoSheets.mockResolvedValueOnce([]);
    const w = mount(OwnerInfoSheetView);
    await flushPromises();
    expect(w.text()).toContain("No information sheet has been requested");
  });
});
