import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The two named slots read from the shared registry, above the loose
// attachments. Uploading into a slot replaces what is there.
vi.mock("../src/lib/resource.js", () => ({
  leasingTransactions: {
    uploadDocument: vi.fn(() => Promise.resolve({})),
    deleteDocument: vi.fn(() => Promise.resolve({})),
    downloadDocument: vi.fn(),
  },
}));

import TransactionDocuments from "../src/components/TransactionDocuments.vue";
import { leasingTransactions } from "../src/lib/resource.js";

const DOCS = [
  { id: "d1", filename: "loi.pdf", size: 2048, docType: "LETTER_OF_INTENT", uploadedByName: "Officer O", createdAt: "2026-09-01T00:00:00Z" },
  { id: "d2", filename: "extra.pdf", size: 1024, docType: null, uploadedByName: "Officer O", createdAt: "2026-09-02T00:00:00Z" },
];

const mountDocs = (documents = DOCS, extraProps = {}) =>
  mount(TransactionDocuments, {
    props: { transactionId: "t1", documents, canUpload: true, canUploadTyped: true, canManage: true, ...extraProps },
  });

const slot = (w, label) => w.findAll(".slot").find((s) => s.text().includes(label));

describe("TransactionDocuments", () => {
  beforeEach(() => { leasingTransactions.uploadDocument.mockClear(); });

  it("shows a named slot for each registry type", () => {
    const w = mountDocs();
    expect(w.findAll(".slot")).toHaveLength(2);
    expect(w.text()).toContain("Letter of Intent");
    expect(w.text()).toContain("Signed Lease Contract");
  });

  it("puts a typed document in its own slot, not the loose list", () => {
    const w = mountDocs();
    expect(slot(w, "Letter of Intent").text()).toContain("loi.pdf");
    expect(w.find(".list").text()).toContain("extra.pdf");
    expect(w.find(".list").text()).not.toContain("loi.pdf");
  });

  it("says plainly when a slot is still empty", () => {
    const w = mountDocs();
    expect(slot(w, "Signed Lease Contract").text()).toContain("Not uploaded yet");
  });

  it("uploads into the slot it belongs to", async () => {
    const w = mountDocs();
    const input = slot(w, "Signed Lease Contract").find("input[type='file']");
    const file = new File(["x"], "contract.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(leasingTransactions.uploadDocument).toHaveBeenCalledWith("t1", file, "SIGNED_CONTRACT");
  });

  it("uploads a loose attachment with no type", async () => {
    const w = mountDocs();
    const input = w.find(".upload input[type='file']");
    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(leasingTransactions.uploadDocument).toHaveBeenCalledWith("t1", file, null);
  });

  it("surfaces a rejected upload rather than failing quietly", async () => {
    leasingTransactions.uploadDocument.mockRejectedValue({ response: { data: { error: "Unknown document type" } } });
    const w = mountDocs();
    const input = slot(w, "Signed Lease Contract").find("input[type='file']");
    Object.defineProperty(input.element, "files", { value: [new File(["x"], "c.pdf")] });
    await input.trigger("change");
    await flushPromises();
    expect(w.find(".error").text()).toContain("Unknown document type");
  });

  // Typed uploads are staff-only server-side (403 for a portal user). A portal
  // party may still add loose attachments, so canUpload alone must not expose
  // the per-slot controls — only canUploadTyped does.
  it("hides the per-slot upload control when canUploadTyped is false, but keeps the loose input", () => {
    const w = mountDocs(DOCS, { canUploadTyped: false });
    expect(slot(w, "Signed Lease Contract").find("input[type='file']").exists()).toBe(false);
    expect(slot(w, "Letter of Intent").find("input[type='file']").exists()).toBe(false);
    expect(w.find(".upload input[type='file']").exists()).toBe(true);
  });
});
