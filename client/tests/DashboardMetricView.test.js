import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// Clicking a KPI tile opens the number's own page rather than lighting up a
// block on the dashboard — the tile is a question ("which units are these?")
// and this is the answer, itemised.
const PAYLOAD = {
  meta: { asOf: "2026-09-06" },
  summary: {
    totalUnits: 4, leased: 2, notLeased: 2, nearExpiry: 1,
    occupancyRate: 50, monthlyActiveRent: 55000,
    buckets: { within30: 1, within60: 0, within90: 0 },
  },
  byProperty: [
    { property: "Ibiza Tower", total: 3, leased: 2, notLeased: 1 },
    { property: "Royalton", total: 1, leased: 0, notLeased: 1 },
  ],
  all: [
    { unit: "19A", property: "Ibiza Tower", tenant: "Ana", owner: "O1", officer: "Jaime", leased: true, monthlyRent: 25000, end: "2026-12-01", daysToExpiry: 300 },
    { unit: "12E", property: "Ibiza Tower", tenant: "Ben", owner: "O1", officer: "Jaime", leased: true, monthlyRent: 30000, end: "2026-09-20", daysToExpiry: 14 },
    { unit: "5I", property: "Royalton", tenant: null, owner: "O2", officer: "Rita", leased: false, monthlyRent: null, end: null, daysToExpiry: null },
    { unit: "7C", property: "Ibiza Tower", tenant: null, owner: "O2", officer: "Rita", leased: false, monthlyRent: null, end: null, daysToExpiry: null },
  ],
};

const route = { params: { key: "all" } };
vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
}));
vi.mock("../src/lib/executiveDashboard.js", () => ({
  fetchExecutiveDashboard: vi.fn(() => Promise.resolve(PAYLOAD)),
  downloadExecutiveExcel: vi.fn(() => Promise.resolve()),
}));

import DashboardMetricView from "../src/views/DashboardMetricView.vue";

async function mountAt(key) {
  route.params.key = key;
  const w = mount(DashboardMetricView);
  await flushPromises();
  return w;
}
const units = (w) => w.findAll("tbody tr").map((r) => r.findAll("td")[0].text());

describe("DashboardMetricView", () => {
  beforeEach(() => { route.params.key = "all"; });

  it("names the metric and shows its headline number", async () => {
    const w = await mountAt("all");
    expect(w.find("h1").text()).toBe("Total Registered Units");
    expect(w.find(".metric__value").text()).toBe("4");
  });

  it("lists every unit behind the total", async () => {
    const w = await mountAt("all");
    expect(units(w)).toEqual(["19A", "12E", "5I", "7C"]);
  });

  it("narrows to the leased units", async () => {
    const w = await mountAt("leased");
    expect(w.find("h1").text()).toBe("Currently Leased");
    expect(units(w)).toEqual(["19A", "12E"]);
  });

  it("narrows to the units still available", async () => {
    const w = await mountAt("available");
    expect(w.find("h1").text()).toBe("Registered but Not Leased");
    expect(units(w)).toEqual(["5I", "7C"]);
  });

  it("narrows to leases near expiry", async () => {
    const w = await mountAt("near-expiry");
    expect(units(w)).toEqual(["12E"]);
  });

  it("breaks occupancy down by property rather than listing units", async () => {
    const w = await mountAt("occupancy");
    expect(w.find("h1").text()).toBe("Lease / Occupancy Rate");
    expect(w.find(".metric__value").text()).toBe("50%");
    const rows = w.findAll("tbody tr").map((r) => r.text());
    expect(rows.some((t) => t.includes("Ibiza Tower"))).toBe(true);
    expect(rows.some((t) => t.includes("Royalton"))).toBe(true);
  });

  it("carries the officer through so the detail matches the dashboard table", async () => {
    const w = await mountAt("leased");
    const heads = w.findAll("thead th").map((h) => h.text());
    expect(heads).toContain("Assigned Officer");
    const col = heads.indexOf("Assigned Officer");
    expect(w.findAll("tbody tr")[0].findAll("td")[col].text()).toBe("Jaime");
  });

  it("offers a way back to the dashboard", async () => {
    const w = await mountAt("all");
    expect(w.find(".back").attributes("href")).toBe("/app");
  });

  it("says so plainly when the metric has no units", async () => {
    const empty = { ...PAYLOAD, all: [] };
    const { fetchExecutiveDashboard } = await import("../src/lib/executiveDashboard.js");
    fetchExecutiveDashboard.mockResolvedValueOnce(empty);
    const w = await mountAt("leased");
    expect(w.text()).toContain("No units");
  });

  it("falls back to the full list for an unknown metric", async () => {
    const w = await mountAt("not-a-metric");
    expect(w.find("h1").text()).toBe("Total Registered Units");
  });
});
