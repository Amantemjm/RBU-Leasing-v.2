import { z } from "zod";
import { cmsFieldsArray } from "./cmsForm.js";

// The Super Admin's configuration for a (role, page) slot.
export const pageFormSaveSchema = z.object({
  title: z.string().optional().nullable(),
  fields: cmsFieldsArray,
});

// A role user's submitted answers for a page form. Values are free-form (the
// shape is defined by the admin's fields), so we only require an object.
export const pageFormEntrySchema = z.object({
  data: z.record(z.string(), z.any()).default({}),
});
