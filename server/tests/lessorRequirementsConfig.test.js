import { describe, it, expect } from "vitest";
import { LESSOR_REQUIREMENT_TYPES, REQUIREMENT_KEYS, REQUIREMENT_STATUSES } from "../../shared/lessorRequirements.js";

describe("Lessor requirements config", () => {
  it("lists the seven requirement types with keys and labels", () => {
    expect(REQUIREMENT_KEYS).toEqual([
      "GOV_ID", "OWNERSHIP", "TAX_DEC", "RPT_RECEIPT", "AUTH_LETTER", "ASSOC_CLEARANCE", "BANK_DETAILS",
    ]);
    expect(LESSOR_REQUIREMENT_TYPES.every((t) => t.key && t.label)).toBe(true);
  });
  it("defines the status vocabulary", () => {
    expect(REQUIREMENT_STATUSES).toContain("Required");
    expect(REQUIREMENT_STATUSES).toContain("Submitted");
    expect(REQUIREMENT_STATUSES).toContain("For Resubmission");
  });
});
