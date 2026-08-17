import { prisma } from "../lib/prisma.js";

const DAY = 86400000;
const NEAR = 90; // near-expiry window (days)
const num = (v) => Number(v || 0);
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function remainingLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  const m = Math.floor(days / 30), d = days % 30;
  return m ? `${m}mo ${d}d` : `${days}d`;
}
const nearAction = (d) => (d <= 30 ? "URGENT — contact tenant now" : d <= 60 ? "Send renewal offer" : "Schedule renewal follow-up");
const vacantAction = (d) => (d >= 180 ? "Long vacant — escalate / re-price" : d >= 90 ? "Re-market aggressively" : "Re-market unit");

// ADMIN sees the whole portfolio; a LEASING_OFFICER sees only units whose owner
// is assigned to them.
export async function getExecutiveDashboard(user, now = new Date()) {
  const where = user?.role === "LEASING_OFFICER" ? { owner: { assignedOfficerId: user.userId } } : {};
  const units = await prisma.unit.findMany({
    where,
    include: {
      owner: { select: { name: true, assignedOfficer: { select: { name: true } } } },
      tower: { select: { name: true, estate: { select: { name: true } } } },
      leases: { select: { tenant: { select: { name: true } }, startDate: true, endDate: true, monthlyRent: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const nowMs = now.getTime();
  const all = units.map((u) => {
    const leases = [...u.leases].sort((a, b) => a.endDate - b.endDate);
    const active = leases.find((l) => l.startDate.getTime() <= nowMs && l.endDate.getTime() >= nowMs);
    const current = active || leases[leases.length - 1] || null;
    const leased = !!current && current.endDate.getTime() >= nowMs && current.status !== "TERMINATED";
    const daysToExpiry = current ? Math.ceil((current.endDate.getTime() - nowMs) / DAY) : null;
    return {
      property: u.tower?.name || u.building || "Unassigned",
      building: u.building || u.tower?.name || "—",
      unit: u.unitNumber, type: u.type || "—", floor: u.floor || "—",
      owner: u.owner?.name || "—", officer: u.owner?.assignedOfficer?.name || "—",
      tenant: current?.tenant?.name || "—",
      start: iso(current?.startDate), end: iso(current?.endDate),
      monthlyRent: current ? num(current.monthlyRent) : null,
      leased, daysToExpiry, status: leased ? "LEASED" : "AVAILABLE",
    };
  });

  const leased = all.filter((u) => u.leased);
  const notLeased = all.filter((u) => !u.leased).map((u) => ({
    ...u,
    unleasedDays: u.daysToExpiry == null ? null : Math.abs(u.daysToExpiry),
    lastLeaseEnd: u.end,
    recommendedAction: vacantAction(u.daysToExpiry == null ? 999 : Math.abs(u.daysToExpiry)),
  }));
  const nearExpiry = leased.filter((u) => u.daysToExpiry <= NEAR).map((u) => ({
    ...u, remaining: remainingLabel(u.daysToExpiry), recommendedAction: nearAction(u.daysToExpiry),
  })).sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  const total = all.length;
  const rate = total ? Math.round((leased.length / total) * 1000) / 10 : 0;
  const monthlyActive = leased.reduce((s, u) => s + (u.monthlyRent || 0), 0);

  const propMap = new Map();
  for (const u of all) {
    const p = propMap.get(u.property) || { property: u.property, total: 0, leased: 0 };
    p.total++; if (u.leased) p.leased++;
    propMap.set(u.property, p);
  }
  const byProperty = [...propMap.values()].map((p) => ({ ...p, notLeased: p.total - p.leased })).sort((a, b) => b.total - a.total);

  const expiryByMonth = {};
  for (const u of leased) {
    if (u.daysToExpiry >= 0 && u.daysToExpiry <= 365 && u.end) {
      const mk = u.end.slice(0, 7);
      expiryByMonth[mk] = (expiryByMonth[mk] || 0) + 1;
    }
  }

  // Every individual lease (all history), for the Excel "Lease Details" sheet.
  const leaseDetails = [];
  for (const u of units) {
    for (const l of u.leases) {
      const active = l.endDate.getTime() >= nowMs && l.status !== "TERMINATED";
      leaseDetails.push({
        property: u.tower?.name || u.building || "Unassigned",
        unit: u.unitNumber, tenant: l.tenant?.name || "—",
        start: iso(l.startDate), end: iso(l.endDate), monthlyRent: num(l.monthlyRent),
        status: l.status === "TERMINATED" ? "TERMINATED" : active ? "ACTIVE" : "EXPIRED",
        owner: u.owner?.name || "—",
      });
    }
  }
  leaseDetails.sort((a, b) => (b.end || "").localeCompare(a.end || ""));

  return {
    meta: { asOf: iso(now), nearExpiryWindowDays: NEAR },
    summary: {
      totalUnits: total, leased: leased.length, notLeased: notLeased.length,
      nearExpiry: nearExpiry.length, occupancyRate: rate,
      monthlyActiveRent: monthlyActive, annualActiveRent: monthlyActive * 12,
      buckets: {
        within30: nearExpiry.filter((u) => u.daysToExpiry <= 30).length,
        within60: nearExpiry.filter((u) => u.daysToExpiry > 30 && u.daysToExpiry <= 60).length,
        within90: nearExpiry.filter((u) => u.daysToExpiry > 60 && u.daysToExpiry <= 90).length,
      },
      longVacant: notLeased.filter((u) => u.unleasedDays != null && u.unleasedDays >= 180).length,
    },
    all, leased, notLeased, nearExpiry, byProperty, expiryByMonth, leaseDetails,
  };
}
