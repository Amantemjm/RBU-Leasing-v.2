import { describe, it, expect } from "vitest";
import { unitCreateSchema } from "../src/validation/unit.js";
import { leaseCreateSchema } from "../src/validation/lease.js";

describe("relaxed/extended validation", () => {
  it("unit accepts free-text type and slotNo", () => {
    const d = unitCreateSchema.parse({ ownerId: "o1", unitNumber: "5A", type: "Prime Suite", slotNo: "B3-15", baseRent: 40000 });
    expect(d.type).toBe("Prime Suite");
    expect(d.slotNo).toBe("B3-15");
  });
  it("lease accepts descriptive text fields", () => {
    const d = leaseCreateSchema.parse({
      unitId: "u1", tenantId: "t1", startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 30000,
      advanceRent: "1 month", securityDeposit: "2 months", modeOfPayment: "PDC",
      serviceFee: "60,000.00 php", source: "Referral", renewalPeriod: "annual", remarks: "note", managedBy: "AAD",
    });
    expect(d.modeOfPayment).toBe("PDC");
    expect(d.managedBy).toBe("AAD");
  });
});
