import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1),
  // Login identifier: a plain username or an email address.
  email: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER", "TENANT"]).optional(),
  unitOwnerId: z.string().nullish(),
  tenantId: z.string().nullish(),
});

// The unit a lessor may describe while applying. Whitelisted explicitly: this
// arrives from an unauthenticated endpoint, so anything not named here — an
// ownerId, an approvalStatus — must never reach the database.
export const pendingUnitSchema = z.object({
  estateId: z.string().min(1).optional(),
  towerId: z.string().min(1).optional(),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.string().optional(),
  slotNo: z.string().optional(),
  type: z.string().optional(),
  baseRent: z.coerce.number().min(0).optional(),
}).strip();

// Public self-registration — lessors/lessees only.
export const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(3), // login username; may or may not be an address
  // Required: the approver has to be able to contact the applicant, and this
  // becomes the linked Owner/Tenant record's email on approval.
  contactEmail: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["UNIT_OWNER", "TENANT"]),
  consent: z.literal(true),
  unit: pendingUnitSchema.optional(),
});

export const rejectAccountSchema = z.object({
  reason: z.string().min(1, "A reason is required"),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER", "TENANT"]).optional(),
});
