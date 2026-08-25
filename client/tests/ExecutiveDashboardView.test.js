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
    { unit: "101", property: "Capitol Commons", tenant: "Acme", owner: "O1", leased: true, monthlyRent: 25000, end: "2026-10-01", daysToExpiry: 37 },
    { unit: "102", property: "Capitol Commons", tenant: null, owner: "O1", leased: false, monthlyRent: null, end: null, daysToExpiry: null },
    { unit: "201", property: "Circulo Verde", tenant: "Beta", owner: "O2", leased: true, monthlyRent: 30000, end: "2027-06-01", daysToExpiry: 400 },
  ],
};

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
  });

  it("gives the blocks stable ids to target", async () => {
    const w = await mountDash();
    expect(w.find("#occupancy").exists()).toBe(true);
    expect(w.find("#leasesExpiring").exists()).toBe(true);
    expect(w.find("#unitsTable").exists()).toBe(true);
  });

  // The whole point of the change: Occupancy must stop jumping to the table.
  it("highlights the Occupancy block when the occupancy tile is clicked", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    expect(scrolled).toEqual(["occupancy"]);
    expect(w.find("#occupancy").classes()).toContain("is-spotlit");
    expect(w.find("#unitsTable").classes()).not.toContain("is-spotlit");
  });

  it("leaves the table filter alone when highlighting Occupancy", async () => {
    const w = await mountDash();
    await tile(w, "Currently Leased").trigger("click");
    await flushPromises();
    const afterLeased = w.find("#unitsTable").text();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    // Occupancy is informational — it must not reset the filter you just set.
    expect(w.find("#unitsTable").text()).toBe(afterLeased);
  });

  it("highlights Leases Expiring when the Near Expiry tile is clicked", async () => {
    const w = await mountDash();
    await tile(w, "Near Expiry").trigger("click");
    await flushPromises();
    expect(scrolled).toEqual(["leasesExpiring"]);
    expect(w.find("#leasesExpiring").classes()).toContain("is-spotlit");
  });

  it.each([
    ["Total Registered Units"],
    ["Currently Leased"],
    ["Registered but Not Leased"],
  ])("keeps %s on the Registered Units table", async (label) => {
    const w = await mountDash();
    await tile(w, label).trigger("click");
    await flushPromises();
    expect(scrolled).toEqual(["unitsTable"]);
    expect(w.find("#unitsTable").classes()).toContain("is-spotlit");
  });

  it("still filters the table for the unit-count tiles", async () => {
    const w = await mountDash();
    await tile(w, "Registered but Not Leased").trigger("click");
    await flushPromises();
    const hint = w.find("#unitsTable").find(".card__hint").text();
    expect(hint).toBe("1 of 3 units"); // only the one unleased unit
  });

  it("dims the rest of the dashboard behind a scrim", async () => {
    const w = await mountDash();
    expect(w.find(".spot-scrim").exists()).toBe(false);
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    expect(w.find(".spot-scrim").exists()).toBe(true);
  });

  // It must not vanish while you are still reading it.
  it("stays lit until dismissed", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    vi.advanceTimersByTime(10000);
    await flushPromises();
    expect(w.find("#occupancy").classes()).toContain("is-spotlit");
  });

  it("releases when the scrim is clicked", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    await w.find(".spot-scrim").trigger("click");
    expect(w.find("#occupancy").classes()).not.toContain("is-spotlit");
    expect(w.find(".spot-scrim").exists()).toBe(false);
  });

  it("releases on Escape", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(w.find("#occupancy").classes()).not.toContain("is-spotlit");
  });

  it("toggles off when the same tile is clicked again", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    expect(w.find("#occupancy").classes()).not.toContain("is-spotlit");
  });

  it("stops listening for Escape once unmounted", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    w.unmount();
    expect(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))).not.toThrow();
  });

  it("moves the spotlight rather than lighting up two blocks at once", async () => {
    const w = await mountDash();
    await tile(w, "Lease / Occupancy Rate").trigger("click");
    await flushPromises();
    await tile(w, "Near Expiry").trigger("click");
    await flushPromises();
    expect(w.find("#occupancy").classes()).not.toContain("is-spotlit");
    expect(w.find("#leasesExpiring").classes()).toContain("is-spotlit");
  });

  // The in-card drill-downs are explicit "show me the rows" actions.
  it("keeps the in-card drill-down links pointed at the table", async () => {
    const w = await mountDash();
    const link = w.find("#leasesExpiring").findAll("button").find((b) => b.text().includes("View expiring leases"));
    await link.trigger("click");
    await flushPromises();
    expect(scrolled).toEqual(["unitsTable"]);
  });
});
