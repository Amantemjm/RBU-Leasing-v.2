import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { inquiryCreateSchema } from "../src/validation/inquiry.js";

beforeEach(async () => { await resetCrudTables(); });

async function ownerAndUnit() {
  const owner = await prisma.unitOwner.create({ data: { name: "OLZ", email: "olz@test.sim" } });
  const unit = await prisma.unit.create({ data: { ownerId: owner.id, unitNumber: "15-08", type: "2 Bedrooms", baseRent: 85000, status: "VACANT" } });
  return { owner, unit };
}

describe("Inquiry.unitId column", () => {
  it("stores and reads back a unitId on an inquiry", async () => {
    const { unit } = await ownerAndUnit();
    const inq = await prisma.inquiry.create({ data: {
      category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
      fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW", unitId: unit.id,
    } });
    const read = await prisma.inquiry.findUnique({ where: { id: inq.id } });
    expect(read.unitId).toBe(unit.id);
  });
});

describe("inquiryCreateSchema unitId", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true };
  it("accepts an optional unitId", () => {
    const parsed = inquiryCreateSchema.parse({ ...base, unitId: "u123" });
    expect(parsed.unitId).toBe("u123");
  });
  it("is valid without a unitId", () => {
    const parsed = inquiryCreateSchema.parse(base);
    expect(parsed.unitId).toBeUndefined();
  });
});
