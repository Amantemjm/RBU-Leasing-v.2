import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ApplicationStatusView from "../src/views/ApplicationStatusView.vue";

const get = vi.fn();
const resubmit = vi.fn(() => Promise.resolve({ status: "PENDING" }));
vi.mock("../src/lib/resource.js", () => ({ application: { get: (...a) => get(...a), resubmit: (...a) => resubmit(...a) } }));

const stubs = { RouterLink: { template: "<a><slot /></a>" } };
const mountView = () => mount(ApplicationStatusView, { global: { stubs } });

beforeEach(() => { vi.clearAllMocks(); });

describe("Application status page", () => {
  it("shows Pending Review while awaiting a decision", async () => {
    get.mockResolvedValue({ status: "PENDING", pendingUnit: { unitNumber: "19A" }, remarks: null });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("Pending Review");
    expect(w.find("form").exists()).toBe(false);
  });

  it("shows the remarks and an editable unit form on For Revision", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "Tower does not match" });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("For Revision");
    expect(w.text()).toContain("Tower does not match");
    expect(w.get("#unitNumber").element.value).toBe("19A");
  });

  it("resubmits the corrected unit", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "wrong" });
    const w = mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("20B");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).toHaveBeenCalledWith(expect.objectContaining({ unitNumber: "20B" }));
  });

  it("shows the reason and no form when rejected", async () => {
    get.mockResolvedValue({ status: "REJECTED", pendingUnit: { unitNumber: "19A" }, remarks: "Could not verify identity" });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("Rejected");
    expect(w.text()).toContain("Could not verify identity");
    expect(w.find("form").exists()).toBe(false);
  });

  it("refuses to resubmit an empty unit number", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "wrong" });
    const w = mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).not.toHaveBeenCalled();
  });
});
