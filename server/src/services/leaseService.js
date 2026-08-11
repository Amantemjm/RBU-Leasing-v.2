import { prisma } from "../lib/prisma.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../lib/errors.js";

async function assertUnitExists(unitId) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw new InvalidReferenceError("unitId does not reference an existing unit");
}

async function assertTenantExists(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new InvalidReferenceError("tenantId does not reference an existing tenant");
}

export function listLeases({ unitId, tenantId, status } = {}) {
  const where = {};
  if (unitId) where.unitId = unitId;
  if (tenantId) where.tenantId = tenantId;
  if (status) where.status = status;
  return prisma.lease.findMany({ where, orderBy: { createdAt: "desc" } });
}

// A UNIT_OWNER only sees leases on units they own.
export function listLeasesForUser(user, filters = {}) {
  const where = {};
  if (filters.unitId) where.unitId = filters.unitId;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.status) where.status = filters.status;
  if (user.role === "UNIT_OWNER") where.unit = { ownerId: user.unitOwnerId || "__none__" };
  return prisma.lease.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function getLease(id) {
  const lease = await prisma.lease.findUnique({ where: { id } });
  if (!lease) throw new NotFoundError("Lease not found");
  return lease;
}

export async function createLease(data) {
  await assertUnitExists(data.unitId);
  await assertTenantExists(data.tenantId);
  return prisma.lease.create({ data });
}

export async function updateLease(id, data) {
  await getLease(id);
  if (data.unitId) await assertUnitExists(data.unitId);
  if (data.tenantId) await assertTenantExists(data.tenantId);
  return prisma.lease.update({ where: { id }, data });
}

export async function removeLease(id) {
  await getLease(id);
  const payments = await prisma.payment.count({ where: { leaseId: id } });
  if (payments > 0) throw new ConflictError(`Lease has ${payments} payment(s); remove them first`);
  await prisma.lease.delete({ where: { id } });
}
