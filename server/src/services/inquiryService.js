import { prisma } from "../lib/prisma.js";
import { NotFoundError, InvalidReferenceError } from "../lib/errors.js";

const assigneeInclude = { assignedTo: { select: { id: true, name: true, email: true } } };

export function createInquiry(data) {
  return prisma.inquiry.create({ data });
}

export function listInquiries() {
  return prisma.inquiry.findMany({ orderBy: { createdAt: "desc" }, include: assigneeInclude });
}

// Assign an inquiry to an O-Lease (LEASING_OFFICER), or null to unassign.
export async function assignInquiry(id, assignedToId) {
  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  if (assignedToId) {
    const user = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!user || user.role !== "LEASING_OFFICER") {
      throw new InvalidReferenceError("assignedToId must reference an O-Lease (LEASING_OFFICER)");
    }
  }
  return prisma.inquiry.update({ where: { id }, data: { assignedToId }, include: assigneeInclude });
}

export async function updateInquiryStatus(id, status) {
  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  return prisma.inquiry.update({ where: { id }, data: { status } });
}

export async function deleteInquiry(id) {
  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) throw new NotFoundError("Inquiry not found");
  await prisma.inquiry.delete({ where: { id } });
}
