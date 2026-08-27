import { z } from "zod";
import { STAGE_KEYS } from "../../../shared/leasingStages.js";

export const txnCreateSchema = z.object({
  lesseeName: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  tenantId: z.string().optional().nullable(),
  unitOwnerId: z.string().optional().nullable(),
  assignedOfficerId: z.string().optional().nullable(),
  startStage: z.string().refine((v) => STAGE_KEYS.includes(v), "invalid startStage").optional(),
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
