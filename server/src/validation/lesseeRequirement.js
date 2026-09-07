import { z } from "zod";
import { LESSEE_REQUIREMENT_STATUSES } from "../../../shared/lesseeRequirements.js";

export const lesseeReviewSchema = z.object({
  status: z.enum(LESSEE_REQUIREMENT_STATUSES),
  remarks: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});
