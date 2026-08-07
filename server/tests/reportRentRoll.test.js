import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { rentRollRows } from "../src/services/reportService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("rentRollRows", () => {
  it("lists active leases with tenant/unit/owner and unpaid balance", async () => {
    const o = await factory.owner({ name: "Ortigas Land" });
    const u = await factory.unit(o.id, { unitNumber: "12A" });
    const t = await factory.tenant({ name: "Maria Santos" });
    const lease = await factory.lease(u.id, t.id, { status: "ACTIVE", monthlyRent: 30000 });
    await factory.payment(lease.id, { amount: 30000, paidDate: null });                          // unpaid -> balance
    await factory.payment(lease.id, { amount: 30000, paidDate: new Date(2026, 0, 10) });          // paid -> not counted

    const rows = await rentRollRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant: "Maria Santos", unit: "12A", owner: "Ortigas Land",
      monthlyRent: 30000, balance: 30000,
    });
  });

  it("excludes non-active leases", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();
    await factory.lease(u.id, t.id, { status: "TERMINATED" });
    expect(await rentRollRows()).toHaveLength(0);
  });
});
