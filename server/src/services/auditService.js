import { prisma } from "../lib/prisma.js";

export function listAudit({ limit = 200 } = {}) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 200, 1000),
  });
}
