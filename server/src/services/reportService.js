import { prisma } from "../lib/prisma.js";
import { addDays } from "../lib/dates.js";

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

export async function leaseExpiryRows(now, days) {
  const until = addDays(now, days);
  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE", endDate: { gte: now, lte: until } },
    include: { unit: { include: { owner: true } }, tenant: true },
    orderBy: { endDate: "asc" },
  });
  return leases.map((l) => ({
    tenant: l.tenant.name,
    unit: l.unit.unitNumber,
    owner: l.unit.owner.name,
    endDate: l.endDate,
    daysRemaining: Math.round((l.endDate.getTime() - now.getTime()) / 86400000),
    monthlyRent: num(l.monthlyRent),
  }));
}

export async function ownerStatementRows() {
  const owners = await prisma.unitOwner.findMany({
    include: { units: { include: { leases: true } } },
    orderBy: { name: "asc" },
  });
  return owners.map((o) => {
    const units = o.units.length;
    const occupied = o.units.filter((u) => u.leases.some((l) => l.status === "ACTIVE")).length;
    const grossMonthlyIncome = o.units.reduce(
      (sum, u) => sum + u.leases.filter((l) => l.status === "ACTIVE").reduce((a, l) => a + num(l.monthlyRent), 0),
      0,
    );
    return {
      owner: o.name,
      units,
      occupied,
      occupancyRate: units === 0 ? 0 : occupied / units,
      grossMonthlyIncome,
    };
  });
}
