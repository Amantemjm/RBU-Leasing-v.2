import { prisma } from "../lib/prisma.js";

export function listEstates() {
  return prisma.estate.findMany({
    include: { towers: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export function listTowers({ estateId } = {}) {
  const where = {};
  if (estateId) where.estateId = estateId;
  return prisma.tower.findMany({ where, orderBy: { name: "asc" } });
}
