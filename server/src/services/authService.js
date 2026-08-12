import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { InvalidReferenceError, NotFoundError, ConflictError } from "../lib/errors.js";

// The seeded super admin cannot be deleted or demoted from ADMIN.
export const SUPER_ADMIN_EMAIL = "admin@rbu.local";

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
  const data = {
    name, email, passwordHash: await hashPassword(password), passwordPlain: password, role: finalRole,
  };

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

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, role: true, passwordPlain: true,
      unitOwnerId: true, tenantId: true, createdAt: true,
    },
  });
  // Expose the recoverable password as `password`; never the hash.
  return users.map(({ passwordPlain, ...u }) => ({ ...u, password: passwordPlain ?? null }));
}

export async function updateUser(id, { name, email, password, role }) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("user not found");
  if (user.email === SUPER_ADMIN_EMAIL && role && role !== "ADMIN") {
    throw new ConflictError("the super admin must remain an ADMIN");
  }
  if (email && email !== user.email) {
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup) throw new ConflictError("username already exists");
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (role !== undefined) data.role = role;
  if (password) {
    data.passwordHash = await hashPassword(password);
    data.passwordPlain = password;
  }

  const updated = await prisma.user.update({ where: { id }, data });
  return {
    id: updated.id, name: updated.name, email: updated.email, role: updated.role,
    unitOwnerId: updated.unitOwnerId, tenantId: updated.tenantId,
  };
}

export async function deleteUser(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("user not found");
  if (user.email === SUPER_ADMIN_EMAIL) throw new ConflictError("the super admin cannot be deleted");
  await prisma.user.delete({ where: { id } });
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
