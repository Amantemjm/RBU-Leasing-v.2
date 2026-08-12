import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

async function assertLeaseExists(leaseId) {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new InvalidReferenceError("leaseId does not reference an existing lease");
}

// Related unit/tenant/owner names for owner/tenant portal tables.
const withLeaseParties = {
  lease: {
    select: {
      id: true,
      unit: { select: { unitNumber: true, owner: { select: { name: true } } } },
      tenant: { select: { name: true } },
    },
  },
};

export function listPayments({ leaseId, status } = {}) {
  const where = {};
  if (leaseId) where.leaseId = leaseId;
  if (status) where.status = status;
  return prisma.payment.findMany({ where, orderBy: { dueDate: "desc" } });
}

// A UNIT_OWNER sees payments on leases of units they own; a TENANT sees only
// payments on their own leases.
export function listPaymentsForUser(user, filters = {}) {
  const where = {};
  if (filters.leaseId) where.leaseId = filters.leaseId;
  if (filters.status) where.status = filters.status;
  if (user.role === "UNIT_OWNER") where.lease = { unit: { ownerId: user.unitOwnerId || "__none__" } };
  if (user.role === "TENANT") where.lease = { tenantId: user.tenantId || "__none__" };
  return prisma.payment.findMany({ where, orderBy: { dueDate: "desc" }, include: withLeaseParties });
}

export async function getPayment(id) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new NotFoundError("Payment not found");
  return payment;
}

// Like getPayment, but an out-of-scope owner/tenant gets 404.
export async function getPaymentForUser(user, id) {
  const payment = await getPayment(id);
  if (user.role === "UNIT_OWNER" || user.role === "TENANT") {
    const lease = await prisma.lease.findUnique({ where: { id: payment.leaseId }, include: { unit: true } });
    if (user.role === "TENANT" && (!lease || lease.tenantId !== user.tenantId)) {
      throw new NotFoundError("Payment not found");
    }
    if (user.role === "UNIT_OWNER" && (!lease || lease.unit?.ownerId !== user.unitOwnerId)) {
      throw new NotFoundError("Payment not found");
    }
  }
  return payment;
}

export async function createPayment(data) {
  await assertLeaseExists(data.leaseId);
  return prisma.payment.create({ data });
}

export async function updatePayment(id, data) {
  await getPayment(id);
  if (data.leaseId) await assertLeaseExists(data.leaseId);
  return prisma.payment.update({ where: { id }, data });
}

export async function removePayment(id) {
  await getPayment(id);
  await prisma.payment.delete({ where: { id } });
}
