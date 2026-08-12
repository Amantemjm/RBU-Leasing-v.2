import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/infoSheets.js", () => ({
  listInfoSheets: vi.fn(() => Promise.resolve([
    { id: "s1", status: "SUBMITTED", submittedAt: "2026-08-12T00:00:00Z", unitOwner: { name: "Ayala" },
      fullName: "Juan", email: "j@x.com", mobile: "09", bankName: "BDO", accountName: "Juan", accountNumber: "001" },
  ])),
  createInfoSheet: vi.fn(() => Promise.resolve({})),
  reviewInfoSheet: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../src/lib/resource.js", () => ({
  owners: { list: vi.fn(() => Promise.resolve([{ id: "o1", name: "Ayala" }, { id: "o2", name: "Beltran" }])) },
}));

import InfoSheetsView from "../src/views/InfoSheetsView.vue";
import { createInfoSheet, reviewInfoSheet } from "../src/lib/infoSheets.js";

function findBtn(w, label) {
  return w.findAll("button").find((b) => b.text() === label);
}

describe("InfoSheetsView (staff)", () => {
  beforeEach(() => { createInfoSheet.mockClear(); reviewInfoSheet.mockClear(); });

  it("lists sheets with owner and status", async () => {
    const w = mount(InfoSheetsView);
    await flushPromises();
    expect(w.text()).toContain("Ayala");
    expect(w.text()).toContain("Submitted");
  });

  it("requests a sheet for a selected owner", async () => {
    const w = mount(InfoSheetsView);
    await flushPromises();
    await w.find(".ss__btn").trigger("click");
    await w.findAll(".ss__opt").find((b) => b.text() === "Beltran").trigger("click");
    await findBtn(w, "Request sheet").trigger("click");
    expect(createInfoSheet).toHaveBeenCalledWith("o2");
  });

  it("opens a submitted sheet and approves it", async () => {
    const w = mount(InfoSheetsView);
    await flushPromises();
    await findBtn(w, "Review").trigger("click");
    expect(w.text()).toContain("Juan"); // submitted values shown read-only
    await findBtn(w, "Approve").trigger("click");
    await flushPromises();
    expect(reviewInfoSheet).toHaveBeenCalledWith("s1", expect.objectContaining({ status: "APPROVED" }));
  });

  it("returns a sheet only when remarks are given", async () => {
    const w = mount(InfoSheetsView);
    await flushPromises();
    await findBtn(w, "Review").trigger("click");
    const returnBtn = findBtn(w, "Return");
    expect(returnBtn.attributes("disabled")).toBeDefined(); // no remarks yet
    await w.find("#remarks").setValue("Bank details unclear");
    expect(findBtn(w, "Return").attributes("disabled")).toBeUndefined();
    await findBtn(w, "Return").trigger("click");
    await flushPromises();
    expect(reviewInfoSheet).toHaveBeenCalledWith("s1", expect.objectContaining({ status: "RETURNED", remarks: "Bank details unclear" }));
  });
});
