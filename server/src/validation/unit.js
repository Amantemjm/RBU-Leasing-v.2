import { z } from "zod";

export const unitCreateSchema = z.object({
  ownerId: z.string().min(1),
  unitNumber: z.string().min(1),
  towerId: z.string().nullish(),
  building: z.string().nullish(),
  floor: z.string().nullish(),
  slotNo: z.string().nullish(),
  type: z.string().nullish(),
  sizeSqm: z.coerce.number().nonnegative().nullish(),
  // Optional: base rent is captured at the lease level, not on the unit. The
  // service defaults it to 0 so registration works without it.
  baseRent: z.coerce.number().nonnegative().nullish(),
  status: z.enum(["VACANT", "OCCUPIED"]).optional(),
});

export const unitUpdateSchema = unitCreateSchema.partial();
