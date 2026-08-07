import { describe, it, expect } from "vitest";
import { periodRange, priorRange } from "../src/services/summaryService.js";

describe("periodRange", () => {
  it("month range", () => {
    expect(periodRange("month", new Date(2026, 5, 15))).toEqual({ start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) });
  });
  it("quarter range (Q2)", () => {
    expect(periodRange("quarter", new Date(2026, 4, 10))).toEqual({ start: new Date(2026, 3, 1), end: new Date(2026, 6, 1) });
  });
  it("year range", () => {
    expect(periodRange("year", new Date(2026, 7, 1))).toEqual({ start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) });
  });
  it("unknown type falls back to month", () => {
    expect(periodRange("weird", new Date(2026, 5, 15))).toEqual({ start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) });
  });
});

describe("priorRange", () => {
  it("prior month", () => {
    expect(priorRange("month", new Date(2026, 5, 15))).toEqual({ start: new Date(2026, 4, 1), end: new Date(2026, 5, 1) });
  });
  it("prior quarter (Q2 -> Q1)", () => {
    expect(priorRange("quarter", new Date(2026, 4, 10))).toEqual({ start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) });
  });
  it("prior year", () => {
    expect(priorRange("year", new Date(2026, 7, 1))).toEqual({ start: new Date(2025, 0, 1), end: new Date(2026, 0, 1) });
  });
});
