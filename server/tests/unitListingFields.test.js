import { describe, it, expect } from "vitest";
import { UNIT_LISTING_FIELDS, UNIT_LISTING_FIELD_KEYS, DEFAULT_VISIBLE_FIELDS, isListingFieldKey } from "../../shared/unitListingFields.js";

describe("unit listing fields", () => {
  it("has a catalog with keys and labels", () => {
    expect(UNIT_LISTING_FIELDS.length).toBeGreaterThan(5);
    for (const f of UNIT_LISTING_FIELDS) { expect(f.key).toBeTruthy(); expect(f.label).toBeTruthy(); expect(f.type).toBeTruthy(); }
    expect(UNIT_LISTING_FIELD_KEYS).toContain("bedrooms");
    expect(UNIT_LISTING_FIELD_KEYS).toContain("rentalRate");
  });
  it("default visible fields are all catalog keys", () => {
    for (const k of DEFAULT_VISIBLE_FIELDS) expect(UNIT_LISTING_FIELD_KEYS).toContain(k);
  });
  it("isListingFieldKey guards unknown keys", () => {
    expect(isListingFieldKey("bedrooms")).toBe(true);
    expect(isListingFieldKey("sneaky")).toBe(false);
  });
});
