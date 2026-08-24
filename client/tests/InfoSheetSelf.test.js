import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// Stub PDF.js-backed components so tests never load pdfjs-dist in jsdom.
vi.mock("../src/components/PdfPreview.vue", () => ({
  default: { name: "PdfPreview", props: ["bytes"], template: "<div class='preview-stub'></div>" },
}));
vi.mock("../src/components/PdfFormFiller.vue", () => ({
  default: {
    name: "PdfFormFiller", props: ["bytes"], emits: ["ready", "error"],
    mounted() { this.$emit("ready"); },
    methods: { getEditedPdf: () => Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46])) },
    template: "<div class='editor-stub'></div>",
  },
}));

import InfoSheetSelf from "../src/components/InfoSheetSelf.vue";

const CONFIG = { title: "T", sections: [{ title: "A", fields: [{ key: "lastName", label: "Last name", type: "text" }] }] };

function makeClient(overrides = {}) {
  return {
    config: vi.fn(() => Promise.resolve(CONFIG)),
    list: vi.fn(() => Promise.resolve([{ id: "s1", status: "REQUESTED", data: {} }])),
    previewBytes: vi.fn(() => Promise.resolve(new ArrayBuffer(8))),
    filledPdfBytes: vi.fn(() => Promise.resolve(null)), // no uploaded PDF → fill mode
    submit: vi.fn((id) => Promise.resolve({ id, status: "SUBMITTED", submittedAt: "2026-08-21T00:00:00.000Z", data: {} })),
    savePdf: vi.fn((id) => Promise.resolve({ id, status: "REQUESTED" })),
    submitFilledPdf: vi.fn((id) => Promise.resolve({ id, status: "SUBMITTED", submittedAt: "2026-08-21T00:00:00.000Z" })),
    downloadFilledPdf: vi.fn(),
    filledPdfUrl: vi.fn(() => Promise.resolve("blob:uploaded")),
    downloadPdf: vi.fn(),
    ...overrides,
  };
}
const pdfFile = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "form.pdf", { type: "application/pdf" });

describe("InfoSheetSelf (split form + live preview)", () => {
  it("renders the form and a live preview, and previews on load", async () => {
    const client = makeClient();
    const w = mount(InfoSheetSelf, { props: { client, filePrefix: "UnitOwnerAcceptanceForm" } });
    await flushPromises();
    expect(w.findComponent({ name: "ConfigurableForm" }).exists()).toBe(true);
    expect(w.find(".preview-stub").exists()).toBe(true);
    expect(client.previewBytes).toHaveBeenCalled();
  });

  it("submits the form data", async () => {
    const client = makeClient();
    const w = mount(InfoSheetSelf, { props: { client, filePrefix: "UnitOwnerAcceptanceForm" } });
    await flushPromises();
    const submit = w.findAll("button").find((b) => b.text().includes("Submit acceptance form"));
    expect(submit).toBeTruthy();
    await submit.trigger("click");
    await flushPromises();
    expect(client.submit).toHaveBeenCalledWith("s1", expect.any(Object));
    expect(w.text()).toContain("Submitted");
  });

  it("switches to upload mode, uploads a PDF, and shows the in-page editor", async () => {
    const client = makeClient();
    client.filledPdfBytes.mockResolvedValueOnce(null).mockResolvedValueOnce(new ArrayBuffer(8));
    const w = mount(InfoSheetSelf, { props: { client, filePrefix: "UnitOwnerAcceptanceForm" } });
    await flushPromises();
    const uploadTab = w.findAll("button").find((b) => b.text().includes("Upload Acceptance Form"));
    await uploadTab.trigger("click");
    const input = w.find('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [pdfFile()], configurable: true });
    await input.trigger("change");
    await flushPromises(); await flushPromises();
    expect(client.savePdf).toHaveBeenCalledWith("s1", expect.any(File));
    expect(w.find(".editor-stub").exists()).toBe(true);
  });

  it("shows a submitted sheet read-only with a download action", async () => {
    const client = makeClient({
      list: vi.fn(() => Promise.resolve([{ id: "s2", status: "SUBMITTED", submittedAt: "2026-08-21T00:00:00.000Z", data: { lastName: "Reyes" } }])),
    });
    const w = mount(InfoSheetSelf, { props: { client, filePrefix: "UnitOwnerAcceptanceForm" } });
    await flushPromises();
    expect(w.findAll("button").some((b) => b.text().includes("Submit acceptance form"))).toBe(false);
    const dl = w.findAll("button").find((b) => b.text().includes("Download PDF"));
    await dl.trigger("click");
    expect(client.downloadPdf).toHaveBeenCalledWith("s2", "UnitOwnerAcceptanceForm-s2.pdf");
  });
});
