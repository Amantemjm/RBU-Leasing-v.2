import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { inquiryCreateSchema } from "../src/validation/inquiry.js";
import { createInquiry, listInquiries, acceptInquiry } from "../src/services/inquiryService.js";

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

describe("createInquiry unit linking", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW" };
  it("stores a valid unitId", async () => {
    const { unit } = await ownerAndUnit();
    const inq = await createInquiry({ ...base, unitId: unit.id });
    expect(inq.unitId).toBe(unit.id);
  });
  it("nulls an unknown unitId but still creates the inquiry", async () => {
    const inq = await createInquiry({ ...base, unitId: "does-not-exist" });
    expect(inq.id).toBeTruthy();
    expect(inq.unitId).toBeNull();
  });
});

describe("listInquiries includes the unit summary", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW" };
  it("returns a unit summary when the inquiry has one", async () => {
    const { unit } = await ownerAndUnit();
    await createInquiry({ ...base, unitId: unit.id });
    const rows = await listInquiries({ role: "ADMIN" });
    expect(rows[0].unit).toMatchObject({ id: unit.id, unitNumber: "15-08" });
  });
  it("returns null unit when there is none", async () => {
    await createInquiry({ ...base });
    const rows = await listInquiries({ role: "ADMIN" });
    expect(rows[0].unit).toBeNull();
  });
});

async function officer() {
  return prisma.user.create({ data: { name: "Officer", email: "officer@test.sim", passwordHash: "x", role: "LEASING_OFFICER" } });
}

describe("accept pre-links the inquired unit + lessor", () => {
  const base = { category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability", fullName: "Ana", email: "ana@example.com", consent: true, status: "NEW" };

  it("sets transaction unitId and unitOwnerId from the inquiry's unit", async () => {
    const { owner, unit } = await ownerAndUnit();
    const inq = await createInquiry({ ...base, unitId: unit.id });
    const off = await officer();
    await acceptInquiry({ userId: off.id, role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    expect(txn.unitId).toBe(unit.id);
    expect(txn.unitOwnerId).toBe(owner.id);
  });

  it("leaves the transaction unlinked when the inquiry has no unit", async () => {
    const inq = await createInquiry({ ...base });
    const off = await officer();
    await acceptInquiry({ userId: off.id, role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    expect(txn.unitId).toBeNull();
    expect(txn.unitOwnerId).toBeNull();
  });

  it("logs a warning event when the inquired unit is not vacant", async () => {
    const { unit } = await ownerAndUnit();
    await prisma.unit.update({ where: { id: unit.id }, data: { status: "OCCUPIED" } });
    const inq = await createInquiry({ ...base, unitId: unit.id });
    const off = await officer();
    await acceptInquiry({ userId: off.id, role: "LEASING_OFFICER" }, inq.id);
    const txn = await prisma.leasingTransaction.findUnique({ where: { inquiryId: inq.id } });
    const events = await prisma.transactionEvent.findMany({ where: { transactionId: txn.id } });
    expect(events.some((e) => e.message.includes("no longer available"))).toBe(true);
  });
});
