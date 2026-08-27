import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import {
  InvalidReferenceError, NotFoundError, ConflictError,
  AccountPendingError, AccountRejectedError,
} from "../lib/errors.js";

// The seeded super admin cannot be deleted or demoted from ADMIN.
export const SUPER_ADMIN_EMAIL = "Admin";

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
    // Only active, approved accounts belong in the system Users list. Pending
    // applications live in Account Approvals; rejected ones are deleted outright.
    where: { status: "APPROVED" },
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

// Public self-registration for a lessor (UNIT_OWNER) or lessee (TENANT). The
// account is created PENDING and no session is issued: an ADMIN or
// LEASING_OFFICER has to approve it first. The linked UnitOwner/Tenant record is
// deliberately NOT created here — it is created on approval, so the Owners and
// Tenants lists only ever contain vetted parties.
export async function signupPortalUser({ name, email, contactEmail, password, role }) {
  if (role !== "UNIT_OWNER" && role !== "TENANT") {
    throw new InvalidReferenceError("role must be UNIT_OWNER or TENANT");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError("An account with that username or email already exists");

  const user = await prisma.user.create({
    data: {
      name, email, contactEmail, role,
      passwordHash: await hashPassword(password), passwordPlain: password,
      status: "PENDING",
    },
  });

  return {
    status: user.status,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, contactEmail: user.contactEmail },
  };
}

const PENDING_SELECT = {
  id: true, name: true, email: true, contactEmail: true, role: true, createdAt: true,
};

export async function listPendingAccounts() {
  return prisma.user.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" }, // oldest application first
    select: PENDING_SELECT,
  });
}

// Approving is what actually brings the party into the business records: the
// UnitOwner/Tenant row is created here and linked, in one transaction with the
// status change so a half-approved account cannot exist.
// The JWT carries only userId and role, so the approver's name has to be
// resolved here — reading it off the token silently records every decision as
// anonymous.
async function approverName(approver) {
  if (!approver?.userId) return null;
  const row = await prisma.user.findUnique({
    where: { id: approver.userId }, select: { name: true },
  });
  return row?.name ?? null;
}

export async function approveAccount(id, approver) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("account not found");
  if (user.status !== "PENDING") {
    throw new ConflictError(`account is already ${user.status.toLowerCase()}`);
  }
  const decidedBy = await approverName(approver);

  return prisma.$transaction(async (tx) => {
    const data = {
      status: "APPROVED",
      approvedById: approver.userId,
      approvedByName: decidedBy,
      decidedAt: new Date(),
      rejectionReason: null,
    };
    if (user.role === "UNIT_OWNER") {
      const owner = await tx.unitOwner.create({ data: { name: user.name, email: user.contactEmail } });
      data.unitOwnerId = owner.id;
    } else if (user.role === "TENANT") {
      const tenant = await tx.tenant.create({ data: { name: user.name, email: user.contactEmail } });
      data.tenantId = tenant.id;
    }
    const updated = await tx.user.update({ where: { id }, data });
    return {
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      status: updated.status, unitOwnerId: updated.unitOwnerId, tenantId: updated.tenantId,
    };
  });
}

// Rejecting an application deletes the account outright. It never lingers among
// system users, and removing the row frees the username so the applicant can
// re-apply later. No linked UnitOwner/Tenant exists yet (those are created only
// on approval), so the delete is self-contained. `reason` is required by the
// operator's confirmation flow but not persisted, since no record is kept.
export async function rejectAccount(id, approver, reason) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("account not found");
  if (user.status !== "PENDING") {
    throw new ConflictError(`account is already ${user.status.toLowerCase()}`);
  }
  void reason;
  await prisma.user.delete({ where: { id } });
  return { id: user.id, name: user.name, email: user.email, status: "REJECTED" };
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");
  // Checked only after the password verifies, so the status of an account is
  // not disclosed to someone guessing credentials.
  if (user.status === "PENDING") throw new AccountPendingError();
  if (user.status === "REJECTED") throw new AccountRejectedError();
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
