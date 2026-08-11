import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";

// Delete in FK-safe order (children before parents). Removes owner/tenant-linked
// user logins too (seeded admin has no link, so it survives).
export async function resetCrudTables() {
  await prisma.payment.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.user.deleteMany({ where: { role: { in: ["UNIT_OWNER", "TENANT"] } } });
  await prisma.unit.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unitOwner.deleteMany();
  await prisma.tower.deleteMany();
  await prisma.estate.deleteMany();
}

export const tokens = {
  admin: () => issueToken({ id: "test-admin", role: "ADMIN" }),
  officer: () => issueToken({ id: "test-officer", role: "LEASING_OFFICER" }),
  viewer: () => issueToken({ id: "test-viewer", role: "VIEWER" }),
};

// Direct-to-DB record factories for cross-entity test setup.
export const factory = {
  owner: (over = {}) => prisma.unitOwner.create({ data: { name: "Owner", ...over } }),
  tenant: (over = {}) => prisma.tenant.create({ data: { name: "Tenant", ...over } }),
  estate: (over = {}) => prisma.estate.create({ data: { name: "Estate", ...over } }),
  tower: (estateId, over = {}) => prisma.tower.create({ data: { estateId, name: "Tower", ...over } }),
  requirement: (tenantId, over = {}) =>
    prisma.requirement.create({
      data: { tenantId, filename: "doc.pdf", mimeType: "application/pdf", size: 3, data: Buffer.from("abc"), ...over },
    }),
  unit: (ownerId, over = {}) =>
    prisma.unit.create({ data: { ownerId, unitNumber: "101", baseRent: 25000, ...over } }),
  lease: (unitId, tenantId, over = {}) =>
    prisma.lease.create({
      data: {
        unitId, tenantId,
        startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
        monthlyRent: 25000, ...over,
      },
    }),
  payment: (leaseId, over = {}) =>
    prisma.payment.create({
      data: {
        leaseId, periodMonth: new Date("2026-01-01"),
        amount: 25000, dueDate: new Date("2026-01-05"), ...over,
      },
    }),
};
