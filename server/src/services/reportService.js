import { prisma } from "../lib/prisma.js";

function num(value) {
  return value == null ? 0 : Number(value);
}

export async function rentRollRows() {
  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE" },
    include: { unit: { include: { owner: true } }, tenant: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  return leases.map((l) => ({
    tenant: l.tenant.name,
    unit: l.unit.unitNumber,
    owner: l.unit.owner.name,
    monthlyRent: num(l.monthlyRent),
    startDate: l.startDate,
    endDate: l.endDate,
    balance: l.payments.filter((p) => p.paidDate == null).reduce((s, p) => s + num(p.amount), 0),
  }));
}

export async function collectionsRows({ start, end }) {
  const payments = await prisma.payment.findMany({
    where: { paidDate: { gte: start, lt: end } },
    include: { lease: { include: { tenant: true, unit: true } } },
    orderBy: { paidDate: "asc" },
  });
  return payments.map((p) => ({
    paidDate: p.paidDate,
    tenant: p.lease.tenant.name,
    unit: p.lease.unit.unitNumber,
    amount: num(p.amount),
    method: p.method || "",
  }));
}
