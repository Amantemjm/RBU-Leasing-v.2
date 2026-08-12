import { z } from "zod";

export const infoSheetCreateSchema = z.object({
  unitOwnerId: z.string().min(1),
});

const REQUIRED = ["fullName", "email", "mobile", "bankName", "accountName", "accountNumber"];
// Treat empty strings as "not provided" so blank optional inputs don't fail format checks.
const emptyToUndef = (v) => (v === "" || v == null ? undefined : v);

export const infoSheetSubmitSchema = z
  .object({
    // Owner personal
    fullName: z.string().optional(),
    email: z.preprocess(emptyToUndef, z.string().email().optional()),
    mobile: z.string().optional(),
    telephone: z.string().optional(),
    mailingAddress: z.string().optional(),
    nationality: z.string().optional(),
    civilStatus: z.string().optional(),
    tin: z.string().optional(),
    governmentIdType: z.string().optional(),
    governmentIdNumber: z.string().optional(),
    birthdate: z.preprocess(emptyToUndef, z.coerce.date().optional()),
    spouseName: z.string().optional(),
    // Authorized representative
    repName: z.string().optional(),
    repContact: z.string().optional(),
    repEmail: z.preprocess(emptyToUndef, z.string().email().optional()),
    // Bank details
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    bankBranch: z.string().optional(),
  })
  .refine(
    (d) => REQUIRED.every((k) => typeof d[k] === "string" && d[k].trim() !== ""),
    { message: "fullName, email, mobile, bankName, accountName and accountNumber are required" },
  );

export const infoSheetReviewSchema = z.object({
  status: z.enum(["APPROVED", "RETURNED"]),
  remarks: z.string().optional(),
});
