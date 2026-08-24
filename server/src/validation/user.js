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

// Public self-registration — lessors/lessees only.
export const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(3), // username or email
  password: z.string().min(6),
  role: z.enum(["UNIT_OWNER", "TENANT"]),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER", "TENANT"]).optional(),
});
