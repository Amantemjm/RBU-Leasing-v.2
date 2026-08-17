import { z } from "zod";

export const ownerCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
});

export const ownerUpdateSchema = ownerCreateSchema.partial();

export const ownerAssignSchema = z.object({
  // A LEASING_OFFICER user id, or null to unassign.
  assignedOfficerId: z.string().min(1).nullable(),
});
