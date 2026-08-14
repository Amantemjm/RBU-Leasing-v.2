import { z } from "zod";
import { INQUIRER_TYPES, INQUIRY_TYPES } from "../../../shared/inquiryTypes.js";

export const inquiryCreateSchema = z
  .object({
    category: z.enum(["RESIDENCES", "OFFICES"]),
    inquirerType: z.enum(INQUIRER_TYPES),
    inquiryType: z.string().min(1),
    fullName: z.string().min(1),
    email: z.string().email(),
    message: z.string().optional(),
    // Consent is mandatory: must be present and exactly true.
    consent: z.literal(true),
  })
  // inquiryType must be one of the allowed options for the chosen inquirerType.
  .refine((d) => INQUIRY_TYPES[d.inquirerType]?.includes(d.inquiryType), {
    message: "inquiryType is not valid for the selected inquirerType",
    path: ["inquiryType"],
  });

export const inquiryUpdateSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "CLOSED"]),
});

export const inquiryAssignSchema = z.object({
  // A user id to assign to, or null to unassign.
  assignedToId: z.string().min(1).nullable(),
});
