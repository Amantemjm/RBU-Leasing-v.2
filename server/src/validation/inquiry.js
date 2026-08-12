import { z } from "zod";

export const inquiryCreateSchema = z.object({
  category: z.enum(["RESIDENCES", "OFFICES"]),
  fullName: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
  // Consent is mandatory: must be present and exactly true.
  consent: z.literal(true),
});

export const inquiryUpdateSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "CLOSED"]),
});
