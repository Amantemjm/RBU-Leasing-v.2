import { z } from "zod";

export const leaseCreateSchema = z.object({
  unitId: z.string().min(1),
  tenantId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.coerce.number().nonnegative(),
  deposit: z.coerce.number().nonnegative().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "TERMINATED"]).optional(),
  advanceRent: z.string().nullish(),
  securityDeposit: z.string().nullish(),
  modeOfPayment: z.string().nullish(),
  serviceFee: z.string().nullish(),
  source: z.string().nullish(),
  renewalPeriod: z.string().nullish(),
  remarks: z.string().nullish(),
  managedBy: z.string().nullish(),
});

export const leaseUpdateSchema = leaseCreateSchema.partial();
