import { z } from "zod";

const emptyToUndef = (v) => (v === "" || v == null ? undefined : v);

// A permissive per-field schema by type. Requiredness is enforced separately
// (below) so empty optional fields never trip type checks.
function fieldSchema(field) {
  switch (field.type) {
    case "email":
      return z.preprocess(emptyToUndef, z.string().email().optional());
    case "number":
      return z.preprocess(emptyToUndef, z.coerce.number().optional());
    default: // text, textarea, tel, date, select
      return z.string().optional();
  }
}

export function fieldsOf(config) {
  return config.sections.flatMap((s) => s.fields);
}

// Build a Zod schema from a config: known keys only (unknown rejected), correct
// types, and every required field present + non-empty.
export function buildSchemaFromConfig(config) {
  const shape = {};
  for (const f of fieldsOf(config)) shape[f.key] = fieldSchema(f);
  return z
    .object(shape)
    .strict() // reject unknown keys
    .superRefine((data, ctx) => {
      for (const f of fieldsOf(config)) {
        if (!f.required) continue;
        const v = data[f.key];
        const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
        if (empty) ctx.addIssue({ code: "custom", path: [f.key], message: `${f.label} is required` });
      }
    });
}
