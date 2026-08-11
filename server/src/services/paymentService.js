import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

async function assertLeaseExists(leaseId) {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new InvalidReferenceError("leaseId does not reference an existing lease");
}

export function listPayments({ leaseId, status } = {}) {
  const where = {};
  if (leaseId) where.leaseId = leaseId;
  if (status) where.status = status;
  return prisma.payment.findMany({ where, orderBy: { dueDate: "desc" } });
}

// A UNIT_OWNER only sees payments on leases of units they own.
export function listPaymentsForUser(user, filters = {}) {
  const where = {};
  if (filters.leaseId) where.leaseId = filters.leaseId;
  if (filters.status) where.status = filters.status;
  if (user.role === "UNIT_OWNER") where.lease = { unit: { ownerId: user.unitOwnerId } };
  return prisma.payment.findMany({ where, orderBy: { dueDate: "desc" } });
}

export async function getPayment(id) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new NotFoundError("Payment not found");
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
