import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/reports.js", () => ({
  reports: {
    rentRoll: vi.fn(() => Promise.resolve()),
    collections: vi.fn(() => Promise.resolve()),
    leaseExpiry: vi.fn(() => Promise.resolve()),
    ownerStatement: vi.fn(() => Promise.resolve()),
  },
}));

import ReportsView from "../src/views/ReportsView.vue";
import { reports } from "../src/lib/reports.js";

describe("ReportsView", () => {
  beforeEach(() => { Object.values(reports).forEach((f) => f.mockClear()); });

  it("downloads the rent roll when its button is clicked", async () => {
    const w = mount(ReportsView);
    const btn = w.findAll("button").find((b) => b.text().includes("Rent Roll"));
    await btn.trigger("click");
    await flushPromises();
    expect(reports.rentRoll).toHaveBeenCalled();
  });

  it("downloads lease expiry with the chosen window", async () => {
    const w = mount(ReportsView);
    const input = w.find('input[type="number"]');
    await input.setValue(30);
    const btn = w.findAll("button").find((b) => b.text().includes("Lease Expiry"));
    await btn.trigger("click");
    await flushPromises();
    expect(reports.leaseExpiry).toHaveBeenCalledWith(30);
  });
});
