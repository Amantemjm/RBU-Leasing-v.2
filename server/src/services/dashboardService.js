import { prisma } from "../lib/prisma.js";
import { startOfMonth, startOfNextMonth } from "../lib/dates.js";

// Prisma Decimal (or null) -> Number
function num(value) {
  return value == null ? 0 : Number(value);
}

export async function getCounts() {
  const [owners, tenants, units] = await Promise.all([
    prisma.unitOwner.count(),
    prisma.tenant.count(),
    prisma.unit.count(),
  ]);
  return { owners, tenants, units };
}

export async function getOccupancy() {
  const totalUnits = await prisma.unit.count();
  const occupied = await prisma.unit.count({
    where: { leases: { some: { status: "ACTIVE" } } },
  });
  const vacant = totalUnits - occupied;
  const rate = totalUnits === 0 ? 0 : occupied / totalUnits;
  return { totalUnits, occupied, vacant, rate };
}

export async function getMonthlyIncome() {
  const activeLeases = await prisma.lease.count({ where: { status: "ACTIVE" } });
  const agg = await prisma.lease.aggregate({
    _sum: { monthlyRent: true },
    where: { status: "ACTIVE" },
  });
  return { activeLeases, monthlyIncome: num(agg._sum.monthlyRent) };
}

export async function getNewLeasesThisMonth(now = new Date()) {
  return prisma.lease.count({
    where: { startDate: { gte: startOfMonth(now), lt: startOfNextMonth(now) } },
  });
}
