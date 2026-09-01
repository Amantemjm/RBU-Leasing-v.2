import { describe, it, expect } from "vitest";
import { labelFor, formatDetail, orderedDetails } from "../src/lib/listingFormat.js";

describe("listingFormat", () => {
  it("labels keys from the shared catalog", () => {
    expect(labelFor("rentalRate")).toMatch(/rental rate/i);
    expect(labelFor("unknownKey")).toBe("unknownKey");
  });
  it("formats rentalRate as currency and amenities as a list", () => {
    expect(formatDetail("rentalRate", 45000)).toMatch(/45,000/);
    expect(formatDetail("amenities", ["Pool", "Gym"])).toBe("Pool, Gym");
    expect(formatDetail("bedrooms", 2)).toBe("2");
  });
  it("orders details by catalog order and drops empty values", () => {
    const out = orderedDetails({ rentalRate: 45000, unitNumber: "12A", bogus: "x", blank: "" });
    const keys = out.map((d) => d.key);
    expect(keys).toContain("unitNumber");
    expect(keys).toContain("rentalRate");
    expect(keys.indexOf("unitNumber")).toBeLessThan(keys.indexOf("rentalRate")); // catalog order
    expect(keys).not.toContain("bogus"); // not a catalog key
  });
  it("excludes keys listed in the exclude option", () => {
    const out = orderedDetails({ location: "X", unitNumber: "12A" }, { exclude: ["location"] });
    const keys = out.map((d) => d.key);
    expect(keys).not.toContain("location");
    expect(keys).toContain("unitNumber");
  });
});
