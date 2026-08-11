import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER", "TENANT"]).optional(),
  unitOwnerId: z.string().nullish(),
  tenantId: z.string().nullish(),
});
