import { z } from "zod";

// Field types the form builder offers. These map 1:1 to the client
// ConfigurableForm renderer (plus "image" for uploads).
export const CMS_FIELD_TYPES = [
  "text",
  "textarea",
  "date",
  "number",
  "email",
  "tel",
  "select",
  "radio",
  "checkboxes",
  "image",
];

const CHOICE_TYPES = ["select", "radio", "checkboxes"];

const fieldSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(CMS_FIELD_TYPES),
    required: z.boolean().optional().default(false),
    placeholder: z.string().optional().default(""),
    help: z.string().optional().default(""),
    // Only meaningful for select/radio/checkboxes; ignored otherwise.
    options: z.array(z.string().min(1)).optional().default([]),
  })
  // Choice fields must define at least one option so the control can render.
  .refine((f) => !CHOICE_TYPES.includes(f.type) || f.options.length > 0, {
    message: "select, radio, and checkboxes fields need at least one option",
    path: ["options"],
  });

export const cmsFieldsArray = z
  .array(fieldSchema)
  .default([])
  // Field keys must be unique within a form so answers don't collide.
  .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, {
    message: "field keys must be unique",
  });

export const cmsFormCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  fields: cmsFieldsArray.optional(),
});

export const cmsFormUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  fields: cmsFieldsArray.optional(),
});
