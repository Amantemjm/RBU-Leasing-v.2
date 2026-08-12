import { prisma } from "../lib/prisma.js";
import { startOfMonth, startOfNextMonth, addDays } from "../lib/dates.js";

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

export async function getNewLeasesThisMonth(now = new Date()) {
  return prisma.lease.count({
    where: { startDate: { gte: startOfMonth(now), lt: startOfNextMonth(now) } },
  });
}

export async function getExpiringLeases(now = new Date()) {
  const d30 = addDays(now, 30);
  const d60 = addDays(now, 60);
  const d90 = addDays(now, 90);
  const [within30, within60, within90] = await Promise.all([
    prisma.lease.count({ where: { status: "ACTIVE", endDate: { gte: now, lte: d30 } } }),
    prisma.lease.count({ where: { status: "ACTIVE", endDate: { gt: d30, lte: d60 } } }),
    prisma.lease.count({ where: { status: "ACTIVE", endDate: { gt: d60, lte: d90 } } }),
  ]);
  return { within30, within60, within90 };
}

export async function getDashboard(now = new Date()) {
  const [counts, occupancy, expiring, newLeasesThisMonth] = await Promise.all([
    getCounts(),
    getOccupancy(),
    getExpiringLeases(now),
    getNewLeasesThisMonth(now),
  ]);
  return { counts, occupancy, expiring, newLeasesThisMonth };
}
