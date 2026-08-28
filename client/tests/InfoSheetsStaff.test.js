import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import InfoSheetsStaff from "../src/components/InfoSheetsStaff.vue";

const CONFIG = { title: "T", sections: [{ title: "A", fields: [{ key: "lastName", label: "Last name", type: "text" }] }] };
const ROW = {
  id: "s1", status: "APPROVED", submittedAt: "2026-08-21T00:00:00.000Z", reviewedAt: "2026-08-22T00:00:00.000Z",
  submittedByName: "Ayala Land", reviewedByName: "Officer Jane", formVersion: "2026-08",
  data: { lastName: "Reyes" }, unitOwner: { id: "o1", name: "Rockwell Land" },
};

function makeClient() {
  return {
    list: vi.fn(() => Promise.resolve([ROW])),
    config: vi.fn(() => Promise.resolve(CONFIG)),
    create: vi.fn(),
    review: vi.fn(() => Promise.resolve({})),
    filledPdfUrl: vi.fn(() => Promise.reject(new Error("404"))), // submitted as structured data
    downloadFilledPdf: vi.fn(),
    downloadPdf: vi.fn(),
  };
}

describe("InfoSheetsStaff metadata", () => {
  it("shows submitted-by, reviewed-by, and form version in the modal", async () => {
    const client = makeClient();
    const w = mount(InfoSheetsStaff, { props: {
      client, parentList: () => Promise.resolve([{ id: "o1", name: "Ayala Land" }]),
      parentKey: "unitOwner", parentLabel: "Owner", filePrefix: "UnitOwnerAcceptanceForm", title: "Lessor Sheets",
    } });
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "View").trigger("click");
    await flushPromises();
    const text = w.text();
    expect(text).toContain("Ayala Land");
    expect(text).toContain("Officer Jane");
    expect(text).toContain("2026-08");
  });
});
