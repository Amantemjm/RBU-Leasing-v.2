import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The lessee's checklist, the mirror of the lessor's: a fixed list of document
// types, one upload each, with the status staff set on review.
const checklist = (over = {}) => [
  { requirementKey: "GOV_ID", label: "Valid Government ID", status: "Required" },
  { id: "r2", requirementKey: "PROOF_INCOME", label: "Proof of Income / Latest Payslips", status: "Submitted", filename: "payslip.pdf" },
  { id: "r3", requirementKey: "COE", label: "Certificate of Employment", status: "Approved", filename: "coe.pdf" },
  { id: "r4", requirementKey: "CLEARANCE", label: "NBI or Police Clearance", status: "Rejected", filename: "nbi.pdf", remarks: "Expired — please resubmit" },
  ...(over.extra || []),
];

vi.mock("../src/lib/resource.js", () => ({
  lesseeRequirements: {
    mine: vi.fn(() => Promise.resolve([])),
    uploadMine: vi.fn(() => Promise.resolve({})),
    download: vi.fn(() => Promise.resolve(new Blob(["x"]))),
  },
}));

import MyLesseeRequirementsView from "../src/views/MyLesseeRequirementsView.vue";
import { lesseeRequirements } from "../src/lib/resource.js";

async function mountView() {
  const w = mount(MyLesseeRequirementsView);
  await flushPromises();
  return w;
}
const item = (w, label) => w.findAll(".item").find((i) => i.text().includes(label));

describe("MyLesseeRequirementsView", () => {
  beforeEach(() => {
    lesseeRequirements.mine.mockClear();
    lesseeRequirements.uploadMine.mockClear();
    lesseeRequirements.mine.mockResolvedValue(checklist());
  });

  it("lists every document on the checklist with its status", async () => {
    const w = await mountView();
    expect(w.findAll(".item")).toHaveLength(4);
    expect(w.text()).toContain("Valid Government ID");
    expect(w.text()).toContain("Certificate of Employment");
  });

  it("offers an upload for anything not yet submitted", async () => {
    const w = await mountView();
    expect(item(w, "Valid Government ID").find("input[type='file']").exists()).toBe(true);
  });

  it("offers a resubmit when staff have rejected one", async () => {
    const w = await mountView();
    const row = item(w, "NBI or Police Clearance");
    expect(row.find("input[type='file']").exists()).toBe(true);
    expect(row.text()).toContain("Expired — please resubmit");
  });

  // Nothing to do once it is approved, and nothing to do while it is being read.
  it("does not offer to replace an approved or submitted document", async () => {
    const w = await mountView();
    expect(item(w, "Certificate of Employment").find("input[type='file']").exists()).toBe(false);
    expect(item(w, "Proof of Income").find("input[type='file']").exists()).toBe(false);
  });

  it("uploads against the document type it belongs to", async () => {
    const w = await mountView();
    const input = item(w, "Valid Government ID").find("input[type='file']");
    const file = new File(["x"], "id.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(lesseeRequirements.uploadMine).toHaveBeenCalledWith("GOV_ID", file);
  });

  it("reloads the checklist after a successful upload", async () => {
    const w = await mountView();
    lesseeRequirements.mine.mockClear();
    const input = item(w, "Valid Government ID").find("input[type='file']");
    Object.defineProperty(input.element, "files", { value: [new File(["x"], "id.pdf")] });
    await input.trigger("change");
    await flushPromises();
    expect(lesseeRequirements.mine).toHaveBeenCalledTimes(1);
  });

  it("surfaces a rejected upload rather than failing quietly", async () => {
    lesseeRequirements.uploadMine.mockRejectedValue({ response: { data: { error: "That file type is not accepted" } } });
    const w = await mountView();
    const input = item(w, "Valid Government ID").find("input[type='file']");
    Object.defineProperty(input.element, "files", { value: [new File(["x"], "id.exe")] });
    await input.trigger("change");
    await flushPromises();
    expect(w.find(".error").text()).toContain("That file type is not accepted");
  });

  it("lets a submitted document be downloaded again", async () => {
    const w = await mountView();
    expect(item(w, "Proof of Income").find(".link").exists()).toBe(true);
  });
});
