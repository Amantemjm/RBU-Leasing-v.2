import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";

// Metadata only — never returns the file bytes.
const META = {
  id: true, tenantId: true, filename: true, mimeType: true, size: true, uploadedAt: true,
  tenant: { select: { id: true, name: true } },
};

export function createRequirement(data) {
  return prisma.requirement.create({ data, select: META });
}

export function listRequirements({ tenantId } = {}) {
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  return prisma.requirement.findMany({ where, select: META, orderBy: { uploadedAt: "desc" } });
}

export async function getRequirement(id) {
  const requirement = await prisma.requirement.findUnique({ where: { id } });
  if (!requirement) throw new NotFoundError("Requirement not found");
  return requirement; // includes data bytes for download
}
