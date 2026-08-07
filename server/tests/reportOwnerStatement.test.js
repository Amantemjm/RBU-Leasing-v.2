import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { leaseExpiryRows, ownerStatementRows } from "../src/services/reportService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("leaseExpiryRows", () => {
  it("lists active leases ending within the window with days remaining", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { unitNumber: "9C" });
    const t = await factory.tenant({ name: "Ana Reyes" });
    const now = new Date(2026, 5, 1);
    await factory.lease(u.id, t.id, { status: "ACTIVE", endDate: new Date(2026, 5, 21) }); // +20d -> in 90d window
    await factory.lease(u.id, t.id, { status: "ACTIVE", endDate: new Date(2026, 11, 1) }); // beyond 90d
    await factory.lease(u.id, t.id, { status: "EXPIRED", endDate: new Date(2026, 5, 10) }); // not active

    const rows = await leaseExpiryRows(now, 90);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant: "Ana Reyes", unit: "9C", daysRemaining: 20 });
  });
});

describe("ownerStatementRows", () => {
  it("summarizes units, occupancy, and gross income per owner", async () => {
    const o = await factory.owner({ name: "Ortigas Land" });
    const u1 = await factory.unit(o.id, { unitNumber: "1" });
    await factory.unit(o.id, { unitNumber: "2" }); // vacant
    const t = await factory.tenant();
    await factory.lease(u1.id, t.id, { status: "ACTIVE", monthlyRent: 40000 });

    const rows = await ownerStatementRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      owner: "Ortigas Land", units: 2, occupied: 1, grossMonthlyIncome: 40000,
    });
    expect(rows[0].occupancyRate).toBeCloseTo(0.5);
  });
});
