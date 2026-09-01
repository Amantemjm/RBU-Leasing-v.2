import { UNIT_LISTING_FIELDS } from "../../../shared/unitListingFields.js";

const BY_KEY = Object.fromEntries(UNIT_LISTING_FIELDS.map((f) => [f.key, f]));

export function labelFor(key) { return BY_KEY[key]?.label || key; }

export function formatDetail(key, value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (key === "rentalRate") {
    const n = Number(value);
    return Number.isFinite(n) ? `₱${n.toLocaleString("en-PH")}` : String(value);
  }
  return String(value);
}

// Returns [{ key, label, value }] for catalog-known keys present in `details`,
// in catalog order, skipping empty values. Pass { exclude } to skip specific keys
// (e.g. "location" when it is already rendered as a dedicated line elsewhere).
export function orderedDetails(details = {}, { exclude = [] } = {}) {
  const out = [];
  for (const f of UNIT_LISTING_FIELDS) {
    if (exclude.includes(f.key)) continue;
    const v = details[f.key];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out.push({ key: f.key, label: f.label, value: formatDetail(f.key, v) });
  }
  return out;
}
