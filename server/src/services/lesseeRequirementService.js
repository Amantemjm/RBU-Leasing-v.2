import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";
import {
  LESSEE_REQUIREMENT_TYPES, LESSEE_REQUIREMENT_KEYS, lesseeLabelFor,
} from "../../../shared/lesseeRequirements.js";

// The lessee half of the document checklist — the mirror of
// lessorRequirementService. Kept as its own module rather than generalised with
// the lessor one: the two lists, their owners and their review flows are free
// to diverge, and a shared abstraction would have to be unpicked the first time
// they do.
const META = {
  id: true, tenantId: true, requirementKey: true, status: true, filename: true, mimeType: true,
  size: true, remarks: true, expiresAt: true, submittedAt: true, reviewedByName: true, reviewedAt: true,
  createdAt: true, updatedAt: true,
};

// The full checklist for a tenant: config order, with anything not yet uploaded
// synthesized as Required so the list is never partial.
export async function listForTenant(tenantId) {
  const rows = await prisma.lesseeRequirement.findMany({ where: { tenantId }, select: META });
  const byKey = new Map(rows.map((r) => [r.requirementKey, r]));
  return LESSEE_REQUIREMENT_TYPES.map((t) =>
    byKey.get(t.key) || { tenantId, requirementKey: t.key, status: "Required" }
  ).map((r) => ({ ...r, label: lesseeLabelFor(r.requirementKey) }));
}

export async function uploadRequirement(tenantId, key, file) {
  if (!LESSEE_REQUIREMENT_KEYS.includes(key)) throw new InvalidReferenceError("Unknown requirement type");
  // A resubmission replaces the file and drops the previous verdict — leaving a
  // "Rejected" beside a freshly uploaded document would be misleading.
  return prisma.lesseeRequirement.upsert({
    where: { tenantId_requirementKey: { tenantId, requirementKey: key } },
    update: {
      filename: file.originalname, mimeType: file.mimetype, size: file.size, data: file.buffer,
      status: "Submitted", submittedAt: new Date(), remarks: null,
      reviewedById: null, reviewedByName: null, reviewedAt: null,
    },
    create: {
      tenantId, requirementKey: key, status: "Submitted", submittedAt: new Date(),
      filename: file.originalname, mimeType: file.mimetype, size: file.size, data: file.buffer,
    },
    select: META,
  });
}

export async function reviewRequirement(actor, id, { status, remarks, expiresAt }) {
  const existing = await prisma.lesseeRequirement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Requirement not found");
  let reviewerName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    reviewerName = u?.name || u?.email || null;
  }
  return prisma.lesseeRequirement.update({
    where: { id },
    data: {
      status, remarks: remarks ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null,
      reviewedById: actor?.userId || null, reviewedByName: reviewerName, reviewedAt: new Date(),
    },
    select: META,
  });
}

export async function getForDownload(id) {
  const row = await prisma.lesseeRequirement.findUnique({ where: { id } });
  if (!row || !row.data) throw new NotFoundError("Document not found");
  return row;
}
