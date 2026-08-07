import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { collectionsRows } from "../src/services/reportService.js";
import { periodRange } from "../src/services/summaryService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("collectionsRows", () => {
  it("lists payments paid within the period", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { unitNumber: "5B" });
    const t = await factory.tenant({ name: "Juan Cruz" });
    const lease = await factory.lease(u.id, t.id);
    await factory.payment(lease.id, { amount: 25000, paidDate: new Date(2026, 5, 10), method: "GCASH" }); // June -> in
    await factory.payment(lease.id, { amount: 99999, paidDate: new Date(2026, 4, 10) });                   // May -> out
    await factory.payment(lease.id, { amount: 88888, paidDate: null });                                    // unpaid -> out

    const rows = await collectionsRows(periodRange("month", new Date(2026, 5, 15)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant: "Juan Cruz", unit: "5B", amount: 25000, method: "GCASH" });
  });
});
