import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";

export function createInquiry(data) {
  return prisma.inquiry.create({ data });
}

export function listInquiries() {
  return prisma.inquiry.findMany({ orderBy: { createdAt: "desc" } });
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
