// Canonical catalog of the details a unit card can display. Drives the staff
// editor, the public card renderer (sub-project J), and server validation.
// `fromUnit` names the core Unit field a detail is pre-filled from, if any.
export const UNIT_LISTING_FIELDS = [
  { key: "propertyName",       label: "Property / Building Name", type: "text",     fromUnit: "building" },
  { key: "unitNumber",         label: "Unit Number",              type: "text",     fromUnit: "unitNumber" },
  { key: "location",           label: "Location",                 type: "text" },
  { key: "unitType",           label: "Unit Type",                type: "text",     fromUnit: "type" },
  { key: "floorArea",          label: "Floor Area (sqm)",         type: "number",   fromUnit: "sizeSqm" },
  { key: "bedrooms",           label: "Bedrooms",                 type: "number" },
  { key: "bathrooms",          label: "Bathrooms",                type: "number" },
  { key: "rentalRate",         label: "Rental Rate",              type: "number",   fromUnit: "baseRent" },
  { key: "amenities",          label: "Amenities & Features",     type: "list" },
  { key: "description",        label: "Unit Description",         type: "textarea" },
  { key: "availabilityStatus", label: "Availability Status",      type: "text" },
];
export const UNIT_LISTING_FIELD_KEYS = UNIT_LISTING_FIELDS.map((f) => f.key);
export const DEFAULT_VISIBLE_FIELDS = ["propertyName", "unitNumber", "location", "unitType", "floorArea", "bedrooms", "bathrooms", "rentalRate"];
export function isListingFieldKey(key) { return UNIT_LISTING_FIELD_KEYS.includes(key); }
