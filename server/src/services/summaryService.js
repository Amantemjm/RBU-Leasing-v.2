import { prisma } from "../lib/prisma.js";
import {
  startOfMonth, startOfNextMonth,
  startOfQuarter, startOfNextQuarter,
  startOfYear, startOfNextYear,
  addDays,
} from "../lib/dates.js";

function num(value) {
  return value == null ? 0 : Number(value);
}

export function periodRange(type, anchor) {
  if (type === "quarter") return { start: startOfQuarter(anchor), end: startOfNextQuarter(anchor) };
  if (type === "year") return { start: startOfYear(anchor), end: startOfNextYear(anchor) };
  return { start: startOfMonth(anchor), end: startOfNextMonth(anchor) };
}

export function priorRange(type, anchor) {
  const { start } = periodRange(type, anchor);
  const priorAnchor = addDays(start, -1);
  return periodRange(type, priorAnchor);
}

export async function metricsFor(range) {
  const { start, end } = range;
  const atEnd = addDays(end, -1); // last day of the period, for point-in-time occupancy

  const [expectedAgg, collectedAgg, newLeases, terminatedLeases, totalUnits, occupied] =
    await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true }, where: { dueDate: { gte: start, lt: end } } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { paidDate: { gte: start, lt: end } } }),
      prisma.lease.count({ where: { startDate: { gte: start, lt: end } } }),
      prisma.lease.count({ where: { status: "TERMINATED", endDate: { gte: start, lt: end } } }),
      prisma.unit.count(),
      prisma.unit.count({
        where: { leases: { some: { status: "ACTIVE", startDate: { lte: atEnd }, endDate: { gte: atEnd } } } },
      }),
    ]);

  const expected = num(expectedAgg._sum.amount);
  const collected = num(collectedAgg._sum.amount);
  const collectionRate = expected === 0 ? 0 : collected / expected;
  const occupancyRate = totalUnits === 0 ? 0 : occupied / totalUnits;

  return { totalIncome: collected, expected, collected, collectionRate, occupancyRate, newLeases, terminatedLeases };
}
