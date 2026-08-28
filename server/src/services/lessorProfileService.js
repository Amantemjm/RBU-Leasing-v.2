import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";
import { listForOwner } from "./lessorRequirementService.js";

export async function getLessorProfile(ownerId) {
  const owner = await prisma.unitOwner.findUnique({
    where: { id: ownerId },
    include: {
      assignedOfficer: { select: { id: true, name: true } },
      users: { select: { contactEmail: true, status: true }, take: 1 },
      units: {
        select: { id: true, unitNumber: true, approvalStatus: true, reviewRemarks: true, updatedAt: true, tower: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      lessorInfoSheets: {
        select: { status: true, submittedAt: true, reviewedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 1,
      },
    },
  });
  if (!owner) throw new NotFoundError("Lessor not found");

  const requirements = await listForOwner(ownerId);
  const approved = requirements.filter((r) => r.status === "Approved").length;
  const sheet = owner.lessorInfoSheets[0] || null;

  const activity = [];
  for (const u of owner.units) activity.push({ at: u.updatedAt, kind: "unit", label: `Unit ${u.unitNumber} — ${u.approvalStatus}` });
  for (const r of requirements) if (r.reviewedAt) activity.push({ at: r.reviewedAt, kind: "requirement", label: `${r.label} — ${r.status}` });
  if (sheet?.submittedAt) activity.push({ at: sheet.submittedAt, kind: "form", label: "Acceptance Form submitted" });
  if (sheet?.reviewedAt) activity.push({ at: sheet.reviewedAt, kind: "form", label: `Acceptance Form ${sheet.status}` });
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    owner: {
      id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, address: owner.address,
      assignedOfficer: owner.assignedOfficer,
    },
    account: owner.users[0] ? { contactEmail: owner.users[0].contactEmail, status: owner.users[0].status } : null,
    units: owner.units.map((u) => ({
      id: u.id, unitNumber: u.unitNumber, tower: u.tower?.name || null,
      approvalStatus: u.approvalStatus, reviewRemarks: u.reviewRemarks, updatedAt: u.updatedAt,
    })),
    requirements: { items: requirements, summary: { approved, total: requirements.length } },
    acceptanceForm: sheet ? { status: sheet.status, submittedAt: sheet.submittedAt, reviewedAt: sheet.reviewedAt } : null,
    activity: activity.slice(0, 10),
  };
}
