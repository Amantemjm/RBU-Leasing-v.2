import { z } from "zod";
import { REQUIREMENT_STATUSES } from "../../../shared/lessorRequirements.js";

export const reviewSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES),
  remarks: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});
