import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/dashboard.js", () => ({
  fetchDashboard: vi.fn(() => Promise.resolve({
    counts: { owners: 2, tenants: 3, units: 5 },
    occupancy: { totalUnits: 5, occupied: 3, vacant: 2, rate: 0.6 },
    income: { activeLeases: 3, monthlyIncome: 90000 },
    expiring: { within30: 1, within60: 0, within90: 2 },
    newLeasesThisMonth: 4,
  })),
}));

import DashboardView from "../src/views/DashboardView.vue";

describe("DashboardView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("renders the metric blocks from the API", async () => {
    const w = mount(DashboardView);
    await flushPromises();
    const text = w.text();
    expect(text).toContain("60%");        // occupancy rate
    expect(text).toContain("90,000");     // monthly income (PHP)
    expect(text).toContain("4");          // new leases this month
    expect(text).toContain("5 units");    // counts
    expect(text).not.toContain("Overdue"); // payments removed
  });
});
