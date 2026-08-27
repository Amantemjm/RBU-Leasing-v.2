import { z } from "zod";

// The only stages a staff-created transaction may start at: the normal front
// door (Inquiry) or, for a lessor already in the system, Send Requirements.
// Starting further along would skip approval routing, so it is not allowed.
export const STARTABLE_STAGES = ["INQUIRY", "SEND_REQUIREMENTS"];

export const txnCreateSchema = z.object({
  lesseeName: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  tenantId: z.string().optional().nullable(),
  unitOwnerId: z.string().optional().nullable(),
  assignedOfficerId: z.string().optional().nullable(),
  startStage: z.enum(STARTABLE_STAGES).optional(),
});

export const txnStatusSchema = z.object({
  status: z.string().min(1),
  remarks: z.string().optional().nullable(),
});

// advance / return: everything optional (system picks sensible defaults)
export const txnStepSchema = z.object({
  status: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const txnLinkSchema = z.object({
  unitId: z.string().nullable().optional(),
  tenantId: z.string().nullable().optional(),
  unitOwnerId: z.string().nullable().optional(),
});

export const approvalDecisionSchema = z.object({
  status: z.string().min(1),
  remarks: z.string().optional().nullable(),
});
