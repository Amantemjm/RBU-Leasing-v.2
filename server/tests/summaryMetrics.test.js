import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { metricsFor, periodRange } from "../src/services/summaryService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("metricsFor (June 2026)", () => {
  it("computes income, expected, rates, new and terminated leases", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();

    // active lease covering all of 2026 -> occupancy + income source
    const lease = await factory.lease(u.id, t.id, {
      status: "ACTIVE", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31),
    });
    // a lease that STARTS in June -> new lease
    await factory.lease(u.id, t.id, { status: "ACTIVE", startDate: new Date(2026, 5, 5), endDate: new Date(2026, 11, 31) });
    // a lease TERMINATED in June -> terminated lease
    await factory.lease(u.id, t.id, { status: "TERMINATED", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 5, 20) });

    // payments
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date(2026, 5, 5), paidDate: new Date(2026, 5, 6) }); // expected + collected
    await factory.payment(lease.id, { amount: 10000, dueDate: new Date(2026, 5, 8), paidDate: null });                 // expected only
    await factory.payment(lease.id, { amount: 99999, dueDate: new Date(2026, 4, 5), paidDate: new Date(2026, 4, 6) }); // May -> outside

    const m = await metricsFor(periodRange("month", new Date(2026, 5, 15)));
    expect(m.expected).toBe(35000);
    expect(m.collected).toBe(25000);
    expect(m.totalIncome).toBe(25000);
    expect(m.collectionRate).toBeCloseTo(25000 / 35000);
    expect(m.newLeases).toBe(1);
    expect(m.terminatedLeases).toBe(1);
    expect(m.occupancyRate).toBeCloseTo(1);
  });

  it("returns zeros for an empty period", async () => {
    const m = await metricsFor(periodRange("month", new Date(2026, 5, 15)));
    expect(m).toEqual({
      totalIncome: 0, expected: 0, collected: 0, collectionRate: 0,
      occupancyRate: 0, newLeases: 0, terminatedLeases: 0,
    });
  });
});
