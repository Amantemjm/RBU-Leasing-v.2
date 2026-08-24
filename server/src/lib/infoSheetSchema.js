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
    case "checkboxes":
      // Multi-select: an array of chosen option strings.
      return z.preprocess(
        (v) => (v == null || v === "" ? [] : v),
        z.array(z.string()).optional(),
      );
    default: // text, textarea, tel, date, select, radio
      return z.string().optional();
  }
}

export function fieldsOf(config) {
  return config.sections.flatMap((s) => s.fields);
}

// Whether a submitted value counts as "empty" for the required check.
function isEmpty(v) {
  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

// Build a Zod schema from a config: known keys only (unknown rejected), correct
// types, and every required field present + non-empty. Choice fields that
// `allowOther` also accept a companion `<key>Other` write-in string.
export function buildSchemaFromConfig(config) {
  const shape = {};
  for (const f of fieldsOf(config)) {
    shape[f.key] = fieldSchema(f);
    if (f.allowOther) shape[`${f.key}Other`] = z.string().optional();
  }
  return z
    .object(shape)
    .strict() // reject unknown keys
    .superRefine((data, ctx) => {
      for (const f of fieldsOf(config)) {
        if (!f.required) continue;
        const chosenOther = f.allowOther && !isEmpty(data[`${f.key}Other`]);
        if (isEmpty(data[f.key]) && !chosenOther) {
          ctx.addIssue({ code: "custom", path: [f.key], message: `${f.label} is required` });
        }
      }
    });
}
