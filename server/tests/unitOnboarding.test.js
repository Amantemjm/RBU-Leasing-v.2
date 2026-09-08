import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, factory, tokens } from "./helpers.js";
import { ensureForUnit, openTransactionForUnit } from "../src/services/leasingTransactionService.js";
import { createApp } from "../src/app.js";

const app = createApp();

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

describe("reference generation", () => {
  // References are derived from a row COUNT, and reference is @unique. An
  // ADMIN deleting a transaction used to drop the count, so the next
  // generated reference collided with a still-existing row and Prisma threw
  // P2002 — silently, since approveUnit swallows the error.
  it("does not collide after a transaction is deleted", async () => {
    const { unit: unit1 } = await ownedUnit({ unitNumber: "01A" });
    const { unit: unit2 } = await ownedUnit({ unitNumber: "01B" });
    const { unit: unit3 } = await ownedUnit({ unitNumber: "01C" });

    const t1 = await ensureForUnit(unit1, { userId: defaultOfficer.id });
    const t2 = await ensureForUnit(unit2, { userId: defaultOfficer.id });
    await prisma.leasingTransaction.delete({ where: { id: t1.id } });

    const t3 = await ensureForUnit(unit3, { userId: defaultOfficer.id });

    const refs = [t1.reference, t2.reference, t3.reference];
    expect(new Set(refs).size).toBe(3);
    expect(t3.reference).not.toBe(t1.reference);
    expect(t3.reference).not.toBe(t2.reference);
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

  // The createdAt-desc ordering is load-bearing: a unit can carry both a
  // closed deal (a prior lease that signed) and a fresh open one, and the
  // seeded demo now has three units in exactly this shape.
  it("returns the open transaction when the unit also has a closed one", async () => {
    const { unit } = await ownedUnit();
    const closed = await ensureForUnit(unit, { userId: defaultOfficer.id });
    await prisma.leasingTransaction.update({
      where: { id: closed.id }, data: { stage: "CONTRACT_SIGNING", status: "Signed", finalStatus: "Signed" },
    });
    const open = await ensureForUnit(unit, { userId: defaultOfficer.id });
    expect(open.id).not.toBe(closed.id);
    const found = await openTransactionForUnit(unit.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(open.id);
  });
});

describe("Approving a unit opens its pipeline", () => {
  async function submittedUnit() {
    const owner = await factory.owner({ name: "Benjamin Tan" });
    return prisma.unit.create({
      data: { ownerId: owner.id, unitNumber: "23F", baseRent: 0, approvalStatus: "SUBMITTED" },
    });
  }

  it("opens a transaction when an officer approves", async () => {
    const unit = await submittedUnit();
    const res = await request(app).patch(`/api/units/${unit.id}/approve`)
      .set("Authorization", `Bearer ${tokens.officer(defaultOfficer.id)}`);
    expect(res.status).toBe(200);
    const txn = await openTransactionForUnit(unit.id);
    expect(txn).not.toBeNull();
    expect(txn.stage).toBe("SEND_REQUIREMENTS");
    expect(txn.unitOwnerId).toBe(unit.ownerId);
  });

  it("does not open a second one when a rejected unit is re-approved", async () => {
    const unit = await submittedUnit();
    const t = tokens.officer(defaultOfficer.id);
    await request(app).patch(`/api/units/${unit.id}/approve`).set("Authorization", `Bearer ${t}`);
    // Reject is only valid from SUBMITTED, so put it back there first.
    await prisma.unit.update({ where: { id: unit.id }, data: { approvalStatus: "SUBMITTED" } });
    await request(app).patch(`/api/units/${unit.id}/reject`).set("Authorization", `Bearer ${t}`)
      .send({ remarks: "Wrong floor plan" });
    await request(app).patch(`/api/units/${unit.id}/submit`).set("Authorization", `Bearer ${t}`);
    await request(app).patch(`/api/units/${unit.id}/approve`).set("Authorization", `Bearer ${t}`);
    expect(await prisma.leasingTransaction.count({ where: { unitId: unit.id } })).toBe(1);
  });

  it("leaves a draft or rejected unit alone", async () => {
    const owner = await factory.owner({ name: "Draft Owner" });
    const unit = await prisma.unit.create({
      data: { ownerId: owner.id, unitNumber: "07C", baseRent: 0, approvalStatus: "DRAFT" },
    });
    const res = await request(app).patch(`/api/units/${unit.id}/approve`)
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(409);
    expect(await openTransactionForUnit(unit.id)).toBeNull();
  });
});
