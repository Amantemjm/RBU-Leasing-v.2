import { describe, it, expect } from "vitest";
import { startOfMonth, startOfNextMonth, addDays } from "../src/lib/dates.js";

describe("date helpers", () => {
  it("startOfMonth returns the first day of the month", () => {
    const d = new Date("2026-03-17T13:45:00Z");
    const s = startOfMonth(d);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(2); // March = 2
    expect(s.getDate()).toBe(1);
  });
  it("startOfNextMonth rolls over the year in December", () => {
    const d = new Date("2026-12-10T00:00:00Z");
    const s = startOfNextMonth(d);
    expect(s.getFullYear()).toBe(2027);
    expect(s.getMonth()).toBe(0); // January
    expect(s.getDate()).toBe(1);
  });
  it("addDays adds and subtracts days", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    expect(addDays(d, 10).getTime()).toBe(d.getTime() + 10 * 86400000);
    expect(addDays(d, -5).getTime()).toBe(d.getTime() - 5 * 86400000);
  });
});
