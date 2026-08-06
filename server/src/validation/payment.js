import { z } from "zod";

export const paymentCreateSchema = z.object({
  leaseId: z.string().min(1),
  periodMonth: z.coerce.date(),
  amount: z.coerce.number().nonnegative(),
  dueDate: z.coerce.date(),
  paidDate: z.coerce.date().nullish(),
  status: z.enum(["PAID", "PENDING", "OVERDUE"]).optional(),
  method: z.string().nullish(),
});

export const paymentUpdateSchema = paymentCreateSchema.partial();
