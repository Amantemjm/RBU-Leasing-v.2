import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";

export function listTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getTenant(id) {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError("Tenant not found");
  return tenant;
}

export function createTenant(data) {
  return prisma.tenant.create({ data });
}

export async function updateTenant(id, data) {
  await getTenant(id);
  return prisma.tenant.update({ where: { id }, data });
}

export async function removeTenant(id) {
  await getTenant(id);
  const leases = await prisma.lease.count({ where: { tenantId: id } });
  if (leases > 0) throw new ConflictError(`Tenant has ${leases} lease(s); remove them first`);
  await prisma.tenant.delete({ where: { id } });
}
