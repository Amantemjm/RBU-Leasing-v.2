import { z } from "zod";
import { APPOINTMENT_STATUSES } from "../../../shared/leasingStages.js";

export const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export const completeSchema = z.object({
  outcome: z.string().optional().nullable(),
});
export const cancelSchema = z.object({
  status: z.enum(["Cancelled", "No-show"]).default("Cancelled"),
  reason: z.string().optional().nullable(),
});
export { APPOINTMENT_STATUSES };
