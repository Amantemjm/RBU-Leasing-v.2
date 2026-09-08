import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, factory } from "./helpers.js";
import { ensureForUnit, openTransactionForUnit } from "../src/services/leasingTransactionService.js";

// A lessor bringing a unit to market gets a transaction of their own — there is
// no lessee yet, and no inquiry to hang it off.
//
// assignedOfficerId is FK-constrained to User, so the "officer-1" actor id used
// throughout this file (whenever the fallback to actor.userId is exercised)
// must resolve to a real row rather than a bare placeholder string.
let defaultOfficer;
beforeEach(async () => {
  await resetCrudTables();
  defaultOfficer = await prisma.user.create({
    data: { name: "Default Officer", email: "officer-1@x.com", passwordHash: "x", role: "LEASING_OFFICER" },
  });
});

async function ownedUnit(over = {}) {
  const owner = await factory.owner({ name: "Maria Santos", ...(over.owner || {}) });
  const unit = await prisma.unit.create({
    data: { ownerId: owner.id, unitNumber: over.unitNumber || "19A", baseRent: 0, approvalStatus: "APPROVED" },
  });
  return { owner, unit };
}

describe("ensureForUnit", () => {
  it("opens a transaction resting at Send Requirements", async () => {
    const { unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: defaultOfficer.id, role: "LEASING_OFFICER" });
    expect(txn.reference).toMatch(/^RBU-\d{4}-\d{6}$/);
    expect(txn.stage).toBe("SEND_REQUIREMENTS");
    expect(txn.status).toBe("Pending");
  });

  it("marks Inquiry skipped rather than pretending one happened", async () => {
    const { unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: defaultOfficer.id });
    expect(txn.stageData.INQUIRY.status).toBe("Skipped");
    expect(txn.stageData.INQUIRY.completedAt).toBeTruthy();
    expect(txn.inquiryId).toBeNull();
  });

  it("links the unit and its lessor, and carries no lessee", async () => {
    const { owner, unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: defaultOfficer.id });
    expect(txn.unitId).toBe(unit.id);
    expect(txn.unitOwnerId).toBe(owner.id);
    expect(txn.tenantId).toBeNull();
    expect(txn.lesseeName).toBeNull();
  });

  it("takes the officer from the owner's assignment", async () => {
    const officer = await prisma.user.create({
      data: { name: "Ramon Cruz", email: "cruz@x.com", passwordHash: "x", role: "LEASING_OFFICER" },
    });
    const owner = await factory.owner({ name: "Assigned Owner", assignedOfficerId: officer.id });
    const unit = await prisma.unit.create({ data: { ownerId: owner.id, unitNumber: "31B", baseRent: 0 } });
    const txn = await ensureForUnit(unit, { userId: "someone-else" });
    expect(txn.assignedOfficerId).toBe(officer.id);
  });

  it("falls back to whoever approved it when the owner has no officer", async () => {
    const approver = await prisma.user.create({
      data: { name: "Elena Reyes", email: "reyes@x.com", passwordHash: "x", role: "LEASING_OFFICER" },
    });
    const { unit } = await ownedUnit();
    const txn = await ensureForUnit(unit, { userId: approver.id });
    expect(txn.assignedOfficerId).toBe(approver.id);
  });

  it("is idempotent — a second call returns the same transaction", async () => {
    const { unit } = await ownedUnit();
    const first = await ensureForUnit(unit, { userId: defaultOfficer.id });
    const second = await ensureForUnit(unit, { userId: defaultOfficer.id });
    expect(second.id).toBe(first.id);
    expect(await prisma.leasingTransaction.count({ where: { unitId: unit.id } })).toBe(1);
  });

  it("opens a fresh one once the previous deal has closed", async () => {
    const { unit } = await ownedUnit();
    const first = await ensureForUnit(unit, { userId: defaultOfficer.id });
    await prisma.leasingTransaction.update({
      where: { id: first.id }, data: { stage: "CONTRACT_SIGNING", status: "Signed", finalStatus: "Signed" },
    });
    const second = await ensureForUnit(unit, { userId: defaultOfficer.id });
    expect(second.id).not.toBe(first.id);
  });

  it("logs an event naming the unit", async () => {
    const { unit } = await ownedUnit({ unitNumber: "07C" });
    const txn = await ensureForUnit(unit, { userId: defaultOfficer.id });
    const events = await prisma.transactionEvent.findMany({ where: { transactionId: txn.id } });
    expect(events.some((e) => e.message.includes("07C"))).toBe(true);
  });
});

describe("openTransactionForUnit", () => {
  it("returns null for a unit that has never been through the pipeline", async () => {
    const { unit } = await ownedUnit();
    expect(await openTransactionForUnit(unit.id)).toBeNull();
  });

  it("ignores a transaction that closed as Declined", async () => {
    const { unit } = await ownedUnit();
    const t = await ensureForUnit(unit, { userId: defaultOfficer.id });
    await prisma.leasingTransaction.update({
      where: { id: t.id }, data: { stage: "CONTRACT_SIGNING", status: "Declined", finalStatus: "Declined" },
    });
    expect(await openTransactionForUnit(unit.id)).toBeNull();
  });

  it("returns a transaction still mid-pipeline", async () => {
    const { unit } = await ownedUnit();
    const t = await ensureForUnit(unit, { userId: defaultOfficer.id });
    expect((await openTransactionForUnit(unit.id)).id).toBe(t.id);
  });
});
