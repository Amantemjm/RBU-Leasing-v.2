import { z } from "zod";

export const unitCreateSchema = z.object({
  ownerId: z.string().min(1),
  unitNumber: z.string().min(1),
  building: z.string().nullish(),
  floor: z.string().nullish(),
  type: z.enum(["STUDIO", "ONE_BR", "TWO_BR", "THREE_BR", "OTHER"]).optional(),
  sizeSqm: z.coerce.number().nonnegative().nullish(),
  baseRent: z.coerce.number().nonnegative(),
  status: z.enum(["VACANT", "OCCUPIED"]).optional(),
});

export const unitUpdateSchema = unitCreateSchema.partial();
