import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";
import { LESSOR_REQUIREMENT_TYPES, REQUIREMENT_KEYS, labelFor } from "../../../shared/lessorRequirements.js";

const META = {
  id: true, unitOwnerId: true, requirementKey: true, status: true, filename: true, mimeType: true,
  size: true, remarks: true, expiresAt: true, submittedAt: true, reviewedByName: true, reviewedAt: true,
  createdAt: true, updatedAt: true,
};

// Full checklist for an owner: config order, missing items synthesized as Required.
export async function listForOwner(unitOwnerId) {
  const rows = await prisma.lessorRequirement.findMany({ where: { unitOwnerId }, select: META });
  const byKey = new Map(rows.map((r) => [r.requirementKey, r]));
  return LESSOR_REQUIREMENT_TYPES.map((t) =>
    byKey.get(t.key) || { unitOwnerId, requirementKey: t.key, label: t.label, status: "Required" }
  ).map((r) => ({ ...r, label: labelFor(r.requirementKey) }));
}

export async function uploadRequirement(unitOwnerId, key, file) {
  if (!REQUIREMENT_KEYS.includes(key)) throw new InvalidReferenceError("Unknown requirement type");
  const row = await prisma.lessorRequirement.upsert({
    where: { unitOwnerId_requirementKey: { unitOwnerId, requirementKey: key } },
    update: {
      filename: file.originalname, mimeType: file.mimetype, size: file.size, data: file.buffer,
      status: "Submitted", submittedAt: new Date(), remarks: null,
      reviewedById: null, reviewedByName: null, reviewedAt: null,
    },
    create: {
      unitOwnerId, requirementKey: key, status: "Submitted", submittedAt: new Date(),
      filename: file.originalname, mimeType: file.mimetype, size: file.size, data: file.buffer,
    },
    select: META,
  });
  return row;
}

export async function reviewRequirement(actor, id, { status, remarks, expiresAt }) {
  const existing = await prisma.lessorRequirement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Requirement not found");
  let reviewerName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    reviewerName = u?.name || u?.email || null;
  }
  return prisma.lessorRequirement.update({
    where: { id },
    data: {
      status, remarks: remarks ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null,
      reviewedById: actor?.userId || null, reviewedByName: reviewerName, reviewedAt: new Date(),
    },
    select: META,
  });
}

export async function getForDownload(id) {
  const row = await prisma.lessorRequirement.findUnique({ where: { id } });
  if (!row || !row.data) throw new NotFoundError("Document not found");
  return row;
}
