import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getNewLeasesThisMonth } from "../src/services/dashboardService.js";

beforeEach(async () => { await resetCrudTables(); });

async function unitAndTenant() {
  const o = await factory.owner();
  const u = await factory.unit(o.id);
  const t = await factory.tenant();
  return { unitId: u.id, tenantId: t.id };
}

describe("getNewLeasesThisMonth", () => {
  it("counts leases starting in the given month", async () => {
    const { unitId, tenantId } = await unitAndTenant();
    const now = new Date("2026-06-15T00:00:00Z");
    await factory.lease(unitId, tenantId, { startDate: new Date("2026-06-03T00:00:00Z") });
    await factory.lease(unitId, tenantId, { startDate: new Date("2026-06-28T00:00:00Z") });
    await factory.lease(unitId, tenantId, { startDate: new Date("2026-05-30T00:00:00Z") }); // prior month
    const count = await getNewLeasesThisMonth(now);
    expect(count).toBe(2);
  });
});
