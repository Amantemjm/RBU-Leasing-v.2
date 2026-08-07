import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const sample = {
  period: { type: "month", label: "June 2026", start: "", end: "" },
  current: { totalIncome: 25000, expected: 35000, collected: 25000, collectionRate: 0.714, occupancyRate: 1, newLeases: 1, terminatedLeases: 0 },
  prior: { totalIncome: 0, expected: 0, collected: 0, collectionRate: 0, occupancyRate: 0.8, newLeases: 0, terminatedLeases: 0 },
  deltas: {
    totalIncome: { change: 25000, pct: null, direction: "up" },
    expected: { change: 35000, pct: null, direction: "up" },
    collected: { change: 25000, pct: null, direction: "up" },
    collectionRate: { change: 0.714, pct: null, direction: "up" },
    occupancyRate: { change: 0.2, pct: 0.25, direction: "up" },
    newLeases: { change: 1, pct: null, direction: "up" },
    terminatedLeases: { change: 0, pct: 0, direction: "flat" },
  },
};

vi.mock("../src/lib/summary.js", () => ({
  fetchSummary: vi.fn(() => Promise.resolve(sample)),
}));

import SummaryView from "../src/views/SummaryView.vue";
import { fetchSummary } from "../src/lib/summary.js";

describe("SummaryView", () => {
  beforeEach(() => { fetchSummary.mockClear(); });

  it("renders the period label and current values", async () => {
    const w = mount(SummaryView);
    await flushPromises();
    const text = w.text();
    expect(text).toContain("June 2026");
    expect(text).toContain("25,000");   // collected (PHP)
    expect(text).toContain("▲");        // an up delta indicator
  });

  it("reloads with the chosen period when a selector button is clicked", async () => {
    const w = mount(SummaryView);
    await flushPromises();
    const quarter = w.findAll("button").find((b) => b.text() === "Quarter");
    await quarter.trigger("click");
    await flushPromises();
    expect(fetchSummary).toHaveBeenCalledWith("quarter");
  });
});
