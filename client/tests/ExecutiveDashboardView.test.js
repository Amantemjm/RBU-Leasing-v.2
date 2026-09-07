import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const PAYLOAD = {
  meta: { asOf: "2026-08-25" },
  summary: {
    totalUnits: 10, leased: 6, notLeased: 4, nearExpiry: 2,
    occupancyRate: 60, monthlyActiveRent: 500000,
    buckets: { within30: 1, within60: 1, within90: 2 },
  },
  byProperty: [
    { property: "Capitol Commons", total: 6, leased: 4, notLeased: 2 },
    { property: "Circulo Verde", total: 4, leased: 2, notLeased: 2 },
  ],
  all: [
    { unit: "101", property: "Capitol Commons", tenant: "Acme", owner: "O1", officer: "Jaime Delacruz", leased: true, monthlyRent: 25000, end: "2026-10-01", daysToExpiry: 37 },
    { unit: "102", property: "Capitol Commons", tenant: null, owner: "O1", officer: "Jaime Delacruz", leased: false, monthlyRent: null, end: null, daysToExpiry: null },
    { unit: "201", property: "Circulo Verde", tenant: "Beta", owner: "O2", officer: "Rita Santos", leased: true, monthlyRent: 30000, end: "2027-06-01", daysToExpiry: 400 },
  ],
};

// Tiles navigate now, so the router is stubbed and the pushes recorded.
const pushed = [];
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: (to) => pushed.push(to) }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
}));

vi.mock("../src/lib/executiveDashboard.js", () => ({
  fetchExecutiveDashboard: vi.fn(() => Promise.resolve(PAYLOAD)),
  downloadExecutiveExcel: vi.fn(() => Promise.resolve()),
}));

import ExecutiveDashboardView from "../src/views/ExecutiveDashboardView.vue";

// jsdom/happy-dom have no layout engine, so scrollIntoView is not implemented.
// Stub it and record what got scrolled to.
function stubScroll() {
  const calls = [];
  Element.prototype.scrollIntoView = function () { calls.push(this.id); };
  return calls;
}

async function mountDash() {
  const w = mount(ExecutiveDashboardView, { attachTo: document.body });
  await flushPromises();
  return w;
}

function tile(w, label) {
  return w.findAll(".kpi").find((b) => b.text().includes(label));
}

describe("ExecutiveDashboardView — tile targets", () => {
  let scrolled;
  beforeEach(() => {
    vi.useFakeTimers();
    scrolled = stubScroll();
    pushed.length = 0;
  });

  it("gives the blocks stable ids to target", async () => {
    const w = await mountDash();
    expect(w.find("#occupancy").exists()).toBe(true);
    expect(w.find("#leasesExpiring").exists()).toBe(true);
    expect(w.find("#unitsTable").exists()).toBe(true);
  });

  // A tile is a question about a number; its answer is a page of its own, not a
  // highlighted block the reader still has to interpret.
  it("opens the metric's own page when a tile is clicked", async () => {
    const w = await mountDash();
    await tile(w, "Total Registered Units").trigger("click");
    await flushPromises();
    expect(pushed).toEqual(["/app/metrics/all"]);
  });

  it("sends each tile to its own metric", async () => {
    const cases = [
      ["Currently Leased", "/app/metrics/leased"],
      ["Registered but Not Leased", "/app/metrics/available"],
      ["Near Expiry", "/app/metrics/near-expiry"],
      ["Lease / Occupancy Rate", "/app/metrics/occupancy"],
    ];
    for (const [label, path] of cases) {
      pushed.length = 0;
      const w = await mountDash();
      await tile(w, label).trigger("click");
      await flushPromises();
      expect(pushed, label).toEqual([path]);
    }
  });

  it("no longer spotlights or scrolls when a tile is clicked", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    expect(w.find("#occupancy").classes()).not.toContain("is-spotlit");
    expect(w.find(".spot-scrim").exists()).toBe(false);
    expect(scrolled).toEqual([]);
  });

  it("leaves the table filter alone when a tile navigates away", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    const on = w.findAll(".quick__pill").find((b) => b.classes().includes("on"));
    expect(on.text()).toContain("All");
  });

  // The in-card drill-downs stay where they were: they are explicit "show me
  // these rows here" actions, and the spotlight is what makes that legible.
  it("keeps the in-card drill-down links pointed at the table", async () => {
    const w = await mountDash();
    const link = w.find("#leasesExpiring").findAll("button").find((b) => b.text().includes("View expiring leases"));
    await link.trigger("click");
    await flushPromises();
    expect(scrolled).toEqual(["unitsTable"]);
    expect(w.find("#unitsTable").classes()).toContain("is-spotlit");
  });

  it("still releases that spotlight on Escape", async () => {
    const w = await mountDash();
    const link = w.find("#leasesExpiring").findAll("button").find((b) => b.text().includes("View expiring leases"));
    await link.trigger("click");
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(w.find("#unitsTable").classes()).not.toContain("is-spotlit");
  });
});

// Registered Units carries the officer looking after each unit, so staff can see
// who owns the relationship without opening the owner record. The service
// already returns it (unit -> owner -> assignedOfficer); this is the column.
describe("ExecutiveDashboardView assigned officer column", () => {
  it("shows an Assigned Officer column in Registered Units", async () => {
    const w = await mountDash();
    const heads = w.findAll("thead th").map((h) => h.text());
    expect(heads).toContain("Assigned Officer");
  });

  it("renders each unit's officer", async () => {
    const w = await mountDash();
    const heads = w.findAll("thead th").map((h) => h.text());
    const col = heads.indexOf("Assigned Officer");
    expect(col).toBeGreaterThan(-1);
    const firstRow = w.findAll("tbody tr")[0].findAll("td");
    expect(firstRow[col].text()).toBe("Jaime Delacruz");
  });

  it("falls back to a dash when no officer is assigned", async () => {
    const w = await mountDash();
    const heads = w.findAll("thead th").map((h) => h.text());
    const col = heads.indexOf("Assigned Officer");
    const rows = w.findAll("tbody tr");
    const beta = rows.find((r) => r.text().includes("Beta"));
    expect(beta.findAll("td")[col].text()).toBe("Rita Santos");
  });
});
