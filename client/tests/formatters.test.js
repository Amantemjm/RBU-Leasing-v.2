import { describe, it, expect } from "vitest";
import { formatPHP, formatDate, toDateInput } from "../src/lib/formatters.js";

describe("formatters", () => {
  it("formats a number as PHP currency", () => {
    expect(formatPHP(25000)).toContain("25,000");
  });
  it("formats a Decimal string as PHP currency", () => {
    expect(formatPHP("80000")).toContain("80,000");
  });
  it("returns empty string for non-numeric", () => {
    expect(formatPHP(null)).toBe("");
  });
  it("slices an ISO datetime to YYYY-MM-DD for date inputs", () => {
    expect(toDateInput("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
  });
  it("formats a date in long standard form", () => {
    expect(formatDate("2026-12-31T00:00:00.000Z")).toBe("December 31, 2026");
    expect(formatDate("2026-08-18")).toBe("August 18, 2026");
    expect(formatDate(null)).toBe("");
  });
});
