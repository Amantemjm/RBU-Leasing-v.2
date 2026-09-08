import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, factory } from "./helpers.js";
import { publish } from "../src/services/unitListingService.js";
import { ensureForUnit } from "../src/services/leasingTransactionService.js";
import { LESSOR_REQUIREMENT_TYPES } from "../../shared/lessorRequirements.js";

// Publishing is the end of the lessor onboarding chain, not a button an officer
// can press at any point: the paperwork must be approved and the shoot done.
//
// assignedOfficerId on LeasingTransaction is FK-constrained to User, so the
// actor passed to ensureForUnit (via the `staff` actor below, whose userId
// feeds that fallback whenever the owner has no assigned officer) must
// resolve to a real row rather than a bare placeholder string.
let staff;
beforeEach(async () => {
  await prisma.lessorRequirement.deleteMany();
  await resetCrudTables();
  const officer = await prisma.user.create({
    data: { name: "Default Officer", email: "officer-1@x.com", passwordHash: "x", role: "LEASING_OFFICER" },
  });
  staff = { userId: officer.id, role: "LEASING_OFFICER" };
});

async function approvedUnit() {
  const owner = await factory.owner({ name: "Maria Santos" });
  const unit = await prisma.unit.create({
    data: { ownerId: owner.id, unitNumber: "19A", baseRent: 0, approvalStatus: "APPROVED" },
  });
  return { owner, unit };
}
async function approveAllRequirements(unitOwnerId) {
  for (const t of LESSOR_REQUIREMENT_TYPES) {
    await prisma.lessorRequirement.create({
      data: { unitOwnerId, requirementKey: t.key, status: "Approved" },
    });
  }
}
async function completePhotoshoot(unitId) {
  const txn = await prisma.leasingTransaction.findFirst({ where: { unitId } });
  await prisma.appointment.create({
    data: { transactionId: txn.id, stage: "PHOTOSHOOT", status: "Completed",
            outcome: "Completed", scheduledAt: new Date() },
  });
}
const addPhoto = (unitId) => prisma.unitPhoto.create({
  data: { unitId, data: Buffer.from("x"), mimeType: "image/png", size: 1 },
});

describe("Publish gate", () => {
  it("refuses a unit that is not approved", async () => {
    const { owner } = await approvedUnit();
    const draft = await prisma.unit.create({
      data: { ownerId: owner.id, unitNumber: "07C", baseRent: 0, approvalStatus: "DRAFT" },
    });
    await expect(publish(staff, draft.id)).rejects.toThrow(/Only an approved unit/);
  });

  it("refuses while the lessor's requirements are outstanding, and says how many", async () => {
    const { unit } = await approvedUnit();
    await ensureForUnit(unit, staff);
    await expect(publish(staff, unit.id)).rejects.toThrow(/requirements must be approved first \(0\/7\)/);
  });

  it("refuses when the photoshoot has not been completed", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await ensureForUnit(unit, staff);
    await expect(publish(staff, unit.id)).rejects.toThrow(/photoshoot has not been completed/);
  });

  it("refuses a unit that never entered the pipeline", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await expect(publish(staff, unit.id)).rejects.toThrow(/photoshoot has not been completed/);
  });

  it("still refuses without a photo once everything else is satisfied", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await ensureForUnit(unit, staff);
    await completePhotoshoot(unit.id);
    await expect(publish(staff, unit.id)).rejects.toThrow(/Add at least one photo/);
  });

  it("publishes once every step is satisfied", async () => {
    const { owner, unit } = await approvedUnit();
    await approveAllRequirements(owner.id);
    await ensureForUnit(unit, staff);
    await completePhotoshoot(unit.id);
    await addPhoto(unit.id);
    const result = await publish(staff, unit.id);
    expect(result.listing.published).toBe(true);
  });

  it("reports the earliest unmet step first", async () => {
    // Nothing done at all — the requirements refusal must win over the
    // photoshoot one, so the officer works the process in order.
    const { unit } = await approvedUnit();
    await expect(publish(staff, unit.id)).rejects.toThrow(/requirements must be approved first/);
  });
});
