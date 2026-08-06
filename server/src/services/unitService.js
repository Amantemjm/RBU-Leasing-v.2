import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../lib/errors.js";

async function assertOwnerExists(ownerId) {
  const owner = await prisma.unitOwner.findUnique({ where: { id: ownerId } });
  if (!owner) throw new InvalidReferenceError("ownerId does not reference an existing owner");
}

export function listUnits({ ownerId, status } = {}) {
  const where = {};
  if (ownerId) where.ownerId = ownerId;
  if (status) where.status = status;
  return prisma.unit.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function getUnit(id) {
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) throw new NotFoundError("Unit not found");
  return unit;
}

export async function createUnit(data) {
  await assertOwnerExists(data.ownerId);
  return prisma.unit.create({ data });
}

export async function updateUnit(id, data) {
  await getUnit(id);
  if (data.ownerId) await assertOwnerExists(data.ownerId);
  return prisma.unit.update({ where: { id }, data });
}

export async function removeUnit(id) {
  await getUnit(id);
  const leases = await prisma.lease.count({ where: { unitId: id } });
  if (leases > 0) throw new ConflictError(`Unit has ${leases} lease(s); remove them first`);
  await prisma.unit.delete({ where: { id } });
}
