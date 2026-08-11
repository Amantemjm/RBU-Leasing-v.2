import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../lib/errors.js";

const withHierarchy = { tower: { include: { estate: true } } };

async function assertOwnerExists(ownerId) {
  const owner = await prisma.unitOwner.findUnique({ where: { id: ownerId } });
  if (!owner) throw new InvalidReferenceError("ownerId does not reference an existing owner");
}

async function assertTowerExists(towerId) {
  const tower = await prisma.tower.findUnique({ where: { id: towerId } });
  if (!tower) throw new InvalidReferenceError("towerId does not reference an existing tower");
}

export function listUnits({ ownerId, status, estateId, towerId, approvalStatus } = {}) {
  const where = {};
  if (ownerId) where.ownerId = ownerId;
  if (status) where.status = status;
  if (towerId) where.towerId = towerId;
  if (estateId) where.tower = { estateId };
  if (approvalStatus) where.approvalStatus = approvalStatus;
  return prisma.unit.findMany({ where, include: withHierarchy, orderBy: { createdAt: "desc" } });
}

// A UNIT_OWNER only ever sees their own owner's units (all approval statuses).
export function listUnitsForUser(user, filters = {}) {
  const f = { ...filters };
  if (user.role === "UNIT_OWNER") f.ownerId = user.unitOwnerId;
  return listUnits(f);
}

export async function createUnitForUser(user, data) {
  const payload = { ...data };
  if (user.role === "UNIT_OWNER") {
    payload.ownerId = user.unitOwnerId; // force own owner
    payload.approvalStatus = "PENDING"; // owner submissions await O-Lease approval
  }
  await assertOwnerExists(payload.ownerId);
  if (payload.towerId) await assertTowerExists(payload.towerId);
  return prisma.unit.create({ data: payload, include: withHierarchy });
}

export async function approveUnit(id, decision) {
  await getUnit(id);
  const approvalStatus = decision === "approve" ? "APPROVED" : "REJECTED";
  return prisma.unit.update({ where: { id }, data: { approvalStatus }, include: withHierarchy });
}

export async function getUnit(id) {
  const unit = await prisma.unit.findUnique({ where: { id }, include: withHierarchy });
  if (!unit) throw new NotFoundError("Unit not found");
  return unit;
}

export async function createUnit(data) {
  await assertOwnerExists(data.ownerId);
  if (data.towerId) await assertTowerExists(data.towerId);
  return prisma.unit.create({ data });
}

export async function updateUnit(id, data) {
  await getUnit(id);
  if (data.ownerId) await assertOwnerExists(data.ownerId);
  if (data.towerId) await assertTowerExists(data.towerId);
  return prisma.unit.update({ where: { id }, data });
}

export async function removeUnit(id) {
  await getUnit(id);
  const leases = await prisma.lease.count({ where: { unitId: id } });
  if (leases > 0) throw new ConflictError(`Unit has ${leases} lease(s); remove them first`);
  await prisma.unit.delete({ where: { id } });
}
