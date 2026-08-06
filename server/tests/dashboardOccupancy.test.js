import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getCounts, getOccupancy } from "../src/services/dashboardService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("getCounts", () => {
  it("counts owners, tenants, and units", async () => {
    const o = await factory.owner();
    await factory.unit(o.id);
    await factory.unit(o.id, { unitNumber: "102" });
    await factory.tenant();
    const counts = await getCounts();
    expect(counts).toEqual({ owners: 1, tenants: 1, units: 2 });
  });
});

describe("getOccupancy", () => {
  it("treats a unit with an ACTIVE lease as occupied", async () => {
    const o = await factory.owner();
    const u1 = await factory.unit(o.id, { unitNumber: "A" });
    await factory.unit(o.id, { unitNumber: "B" }); // vacant
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id, { status: "ACTIVE" });
    const occ = await getOccupancy();
    expect(occ.totalUnits).toBe(2);
    expect(occ.occupied).toBe(1);
    expect(occ.vacant).toBe(1);
    expect(occ.rate).toBeCloseTo(0.5);
  });
  it("does not count EXPIRED leases as occupancy", async () => {
    const o = await factory.owner();
    const u1 = await factory.unit(o.id);
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id, { status: "EXPIRED" });
    const occ = await getOccupancy();
    expect(occ.occupied).toBe(0);
  });
  it("returns rate 0 when there are no units", async () => {
    const occ = await getOccupancy();
    expect(occ).toEqual({ totalUnits: 0, occupied: 0, vacant: 0, rate: 0 });
  });
});
