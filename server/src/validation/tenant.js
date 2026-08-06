import { z } from "zod";

export const tenantCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
});

export const tenantUpdateSchema = tenantCreateSchema.partial();
