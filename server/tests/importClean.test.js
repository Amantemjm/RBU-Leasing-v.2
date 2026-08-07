import { describe, it, expect } from "vitest";
import { rowOffset, text, money, toDate, leaseStatus, key } from "../src/lib/importClean.js";

describe("importClean", () => {
  it("detects a leading row-index number", () => {
    expect(rowOffset(1)).toBe(1);
    expect(rowOffset("AAD")).toBe(0);
    expect(rowOffset(null)).toBe(0);
  });
  it("cleans text and null-ish placeholders", () => {
    expect(text("  Ibiza ")).toBe("Ibiza");
    expect(text("n/a")).toBeNull();
    expect(text("-")).toBeNull();
    expect(text("")).toBeNull();
  });
  it("parses money from numbers and messy strings", () => {
    expect(money(24000)).toBe(24000);
    expect(money("100,000.00 php")).toBe(100000);
    expect(money("2 months")).toBeNull();
  });
  it("parses dates", () => {
    expect(toDate(new Date(2026, 0, 1)).getFullYear()).toBe(2026);
    expect(toDate("2026-06-15").getMonth()).toBe(5);
    expect(toDate("garbage")).toBeNull();
  });
  it("derives lease status from end date", () => {
    const now = new Date(2026, 7, 7);
    expect(leaseStatus(new Date(2027, 0, 1), now)).toBe("ACTIVE");
    expect(leaseStatus(new Date(2025, 0, 1), now)).toBe("EXPIRED");
  });
  it("normalizes dedup keys", () => {
    expect(key("  Marybeth   Monis ")).toBe(key("marybeth monis"));
  });
});
