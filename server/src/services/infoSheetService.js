import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

const ownerInclude = { unitOwner: { select: { id: true, name: true, email: true } } };

export async function createRequest({ unitOwnerId }) {
  const owner = await prisma.unitOwner.findUnique({ where: { id: unitOwnerId } });
  if (!owner) throw new InvalidReferenceError("unitOwnerId does not reference an existing owner");
  return prisma.unitOwnerInfoSheet.create({ data: { unitOwnerId }, include: ownerInclude });
}

// Staff see every sheet; a UNIT_OWNER only sees their own.
export function listSheets(user) {
  const where = user?.role === "UNIT_OWNER" ? { unitOwnerId: user.unitOwnerId || "__none__" } : {};
  return prisma.unitOwnerInfoSheet.findMany({ where, orderBy: { createdAt: "desc" }, include: ownerInclude });
}

export async function getSheet(id) {
  const sheet = await prisma.unitOwnerInfoSheet.findUnique({ where: { id }, include: ownerInclude });
  if (!sheet) throw new NotFoundError("Info sheet not found");
  return sheet;
}

export async function getSheetForUser(user, id) {
  const sheet = await getSheet(id);
  if (user.role === "UNIT_OWNER" && sheet.unitOwnerId !== user.unitOwnerId) {
    throw new NotFoundError("Info sheet not found");
  }
  return sheet;
}

// The owning UNIT_OWNER fills in and submits their sheet.
export async function submitSheet(user, id, data) {
  const sheet = await getSheet(id);
  if (sheet.unitOwnerId !== user.unitOwnerId) throw new NotFoundError("Info sheet not found");
  return prisma.unitOwnerInfoSheet.update({
    where: { id },
    data: { ...data, status: "SUBMITTED", submittedAt: new Date() },
    include: ownerInclude,
  });
}

// O-Lease/Admin approves or returns the submitted sheet.
export async function reviewSheet(id, { status, remarks }) {
  await getSheet(id);
  return prisma.unitOwnerInfoSheet.update({
    where: { id },
    data: { status, remarks: remarks ?? null, reviewedAt: new Date() },
    include: ownerInclude,
  });
}
