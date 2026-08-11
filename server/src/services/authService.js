import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { InvalidReferenceError } from "../lib/errors.js";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function issueToken({ id, role, unitOwnerId = null, tenantId = null }) {
  return jwt.sign(
    { userId: id, role, unitOwnerId: unitOwnerId ?? null, tenantId: tenantId ?? null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" },
  );
}

export async function registerUser({ name, email, password, role, unitOwnerId, tenantId }) {
  const finalRole = role || "VIEWER";
  const data = { name, email, passwordHash: await hashPassword(password), role: finalRole };

  // The owner/tenant link is optional — a plain login can be created with just a
  // name, username, and password. If a link IS supplied it must reference a real record.
  if (finalRole === "UNIT_OWNER" && unitOwnerId) {
    const owner = await prisma.unitOwner.findUnique({ where: { id: unitOwnerId } });
    if (!owner) throw new InvalidReferenceError("unitOwnerId does not reference an existing owner");
    data.unitOwnerId = unitOwnerId;
  }
  if (finalRole === "TENANT" && tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new InvalidReferenceError("tenantId does not reference an existing tenant");
    data.tenantId = tenantId;
  }

  const user = await prisma.user.create({ data });
  return {
    id: user.id, name: user.name, email: user.email, role: user.role,
    unitOwnerId: user.unitOwnerId, tenantId: user.tenantId,
  };
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");
  const token = issueToken({
    id: user.id, role: user.role, unitOwnerId: user.unitOwnerId, tenantId: user.tenantId,
  });
  return {
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      unitOwnerId: user.unitOwnerId, tenantId: user.tenantId,
    },
  };
}
