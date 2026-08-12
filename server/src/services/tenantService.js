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

// The tenant record linked to the calling TENANT account.
export async function getTenantMe(user) {
  if (!user.tenantId) throw new NotFoundError("No tenant record linked to this account");
  return getTenant(user.tenantId);
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
