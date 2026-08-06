import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";

export function listOwners() {
  return prisma.unitOwner.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getOwner(id) {
  const owner = await prisma.unitOwner.findUnique({ where: { id } });
  if (!owner) throw new NotFoundError("Owner not found");
  return owner;
}

export function createOwner(data) {
  return prisma.unitOwner.create({ data });
}

export async function updateOwner(id, data) {
  await getOwner(id);
  return prisma.unitOwner.update({ where: { id }, data });
}

export async function removeOwner(id) {
  await getOwner(id);
  const units = await prisma.unit.count({ where: { ownerId: id } });
  if (units > 0) throw new ConflictError(`Owner has ${units} unit(s); remove them first`);
  await prisma.unitOwner.delete({ where: { id } });
}
