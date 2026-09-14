import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import {
  InvalidReferenceError, NotFoundError, ConflictError,
} from "../lib/errors.js";
import { ensureForUnit } from "./leasingTransactionService.js";

// The seeded super admin cannot be deleted or demoted from ADMIN.
export const SUPER_ADMIN_EMAIL = "Admin";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function issueToken({ id, role, unitOwnerId = null, tenantId = null, status = "APPROVED" }) {
  return jwt.sign(
    { userId: id, role, unitOwnerId: unitOwnerId ?? null, tenantId: tenantId ?? null, status },
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
    // Only active, approved accounts belong in the system Users list. Pending,
    // for-revision, and rejected applications all live in Account Approvals.
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
export async function signupPortalUser({ name, email, contactEmail, password, role, unit }) {
  if (role !== "UNIT_OWNER" && role !== "TENANT") {
    throw new InvalidReferenceError("role must be UNIT_OWNER or TENANT");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError("An account with that username or email already exists");

  // Only a lessor can bring a unit; a tenant application never carries one.
  let pendingUnit = null;
  if (unit && role === "UNIT_OWNER") {
    // Validate the references now rather than at approval: an applicant who
    // picked a real estate and tower should not be told at approval time that
    // their application is unusable.
    if (unit.estateId && !(await prisma.estate.findUnique({ where: { id: unit.estateId } }))) {
      throw new InvalidReferenceError("estate not found");
    }
    if (unit.towerId && !(await prisma.tower.findUnique({ where: { id: unit.towerId } }))) {
      throw new InvalidReferenceError("tower not found");
    }
    pendingUnit = unit;
  }

  const user = await prisma.user.create({
    data: {
      name, email, contactEmail, role,
      passwordHash: await hashPassword(password), passwordPlain: password,
      status: "PENDING",
      pendingUnit,
    },
  });

  // Best-effort: link the applicant's most recent open inquiry to this account so
  // the journey from first contact to onboarding is captured. Never fails signup.
  try {
    const inquirerType = role === "UNIT_OWNER" ? "LESSOR" : "LESSEE";
    const match = await prisma.inquiry.findFirst({
      where: { email: contactEmail, inquirerType, status: { in: ["NEW", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
    });
    if (match) {
      await prisma.inquiry.update({ where: { id: match.id }, data: { status: "CONVERTED", convertedUserId: user.id } });
    }
  } catch { /* linkage is best-effort */ }

  return {
    status: user.status,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, contactEmail: user.contactEmail },
  };
}

const PENDING_SELECT = {
  id: true, name: true, email: true, contactEmail: true, role: true, createdAt: true,
  pendingUnit: true,
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

// The unit a lessor described at signup, turned into a real row now that they
// have an owner record to hang it on.
//
// A tower deleted between signup and approval is dropped rather than fatal —
// reference data changing must never leave an applicant unapprovable.
async function buildPendingUnit(tx, ownerId, pending) {
  const towerId = pending.towerId && (await tx.tower.findUnique({ where: { id: pending.towerId } }))
    ? pending.towerId
    : null;
  return {
    ownerId,
    unitNumber: pending.unitNumber,
    towerId,
    floor: pending.floor || null,
    slotNo: pending.slotNo || null,
    // Unit.type has a default; only override it when the lessor named one.
    ...(pending.type ? { type: pending.type } : {}),
    // baseRent is a required Decimal while the signup field is optional.
    baseRent: pending.baseRent ?? 0,
    // Approved outright: this unit's details were just reviewed as half of the
    // application decision. DRAFT means "the lessor is still describing it",
    // which is no longer true by the time this runs.
    approvalStatus: "APPROVED",
  };
}

// A decision is only open while the applicant has not been finally judged.
// FOR_REVISION is included so an officer can reject an application they had
// previously sent back.
const DECIDABLE = ["PENDING", "FOR_REVISION"];

// Looks up the account and enforces that it is still open for a decision.
// Shared by approveAccount/rejectAccount/reviseAccount so the not-found and
// decidability checks stay in one place.
async function findDecidableAccount(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("account not found");
  if (!DECIDABLE.includes(user.status)) {
    throw new ConflictError(`account is already ${user.status.toLowerCase()}`);
  }
  return user;
}

export async function approveAccount(id, approver) {
  const user = await findDecidableAccount(id);
  const decidedBy = await approverName(approver);

  let createdUnit = null;
  const result = await prisma.$transaction(async (tx) => {
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
      if (user.pendingUnit) {
        createdUnit = await tx.unit.create({
          data: await buildPendingUnit(tx, owner.id, user.pendingUnit),
          include: { owner: true },
        });
        data.pendingUnit = null; // consumed
      }
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

  // Outside the transaction and deliberately not fatal. An approved account
  // whose transaction failed to open is recoverable; an approval that
  // half-applied is not. Mirrors approveUnit's handling of the same call.
  if (createdUnit) {
    try {
      await ensureForUnit(createdUnit, approver);
    } catch (err) {
      console.error(`Could not open onboarding transaction for unit ${createdUnit.id}:`, err);
    }
  }

  return result;
}

export async function rejectAccount(id, approver, reason) {
  const user = await findDecidableAccount(id);
  // The row is kept rather than deleted: the applicant signs in to a read-only
  // status page to be told why, which a deleted row cannot do.
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      approvedById: approver.userId,
      approvedByName: await approverName(approver),
      decidedAt: new Date(),
    },
  });
  return { id: updated.id, name: updated.name, email: updated.email, status: updated.status, reason };
}

export async function reviseAccount(id, approver, remarks) {
  const user = await findDecidableAccount(id);
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "FOR_REVISION",
      rejectionReason: remarks, // one column carries the remarks for both
      approvedById: approver.userId,
      approvedByName: await approverName(approver),
      decidedAt: new Date(),
    },
  });
  return { id: updated.id, name: updated.name, email: updated.email, status: updated.status, remarks };
}

const APPLICATION_SELECT = {
  id: true, name: true, email: true, contactEmail: true, role: true,
  status: true, rejectionReason: true, decidedAt: true, pendingUnit: true, createdAt: true,
};

function asApplication(user) {
  const { rejectionReason, ...rest } = user;
  // One column carries both a rejection reason and revision remarks; the client
  // reads one field and decides what to call it from the status.
  return { ...rest, remarks: rejectionReason };
}

export async function getApplication(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: APPLICATION_SELECT });
  if (!user) throw new NotFoundError("account not found");
  return asApplication(user);
}

export async function resubmitApplication(userId, unit) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("account not found");
  if (user.status !== "FOR_REVISION") {
    throw new ConflictError("this application is not open for revision");
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    // Only these three fields. The unit has already been through
    // pendingUnitSchema, so no key outside the whitelist can be here.
    data: { pendingUnit: unit, status: "PENDING", rejectionReason: null },
    select: APPLICATION_SELECT,
  });
  return asApplication(updated);
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");
  // Every status may sign in. A non-approved account receives a restricted
  // token that verifyJwt refuses everywhere except the application-status
  // routes — the status page is the only way to tell an applicant where they
  // stand, because the system has no outbound email.
  const token = issueToken({
    id: user.id, role: user.role, unitOwnerId: user.unitOwnerId,
    tenantId: user.tenantId, status: user.status,
  });
  return {
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      unitOwnerId: user.unitOwnerId, tenantId: user.tenantId, status: user.status,
    },
  };
}
