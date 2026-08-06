import { z } from "zod";

export const leaseCreateSchema = z.object({
  unitId: z.string().min(1),
  tenantId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.coerce.number().nonnegative(),
  deposit: z.coerce.number().nonnegative().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "TERMINATED"]).optional(),
});

export const leaseUpdateSchema = leaseCreateSchema.partial();
