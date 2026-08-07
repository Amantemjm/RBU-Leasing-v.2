import { describe, it, expect } from "vitest";
import { startOfQuarter, startOfNextQuarter, startOfYear, startOfNextYear } from "../src/lib/dates.js";

describe("quarter/year helpers", () => {
  it("startOfQuarter snaps to the quarter's first month", () => {
    expect(startOfQuarter(new Date(2026, 4, 10))).toEqual(new Date(2026, 3, 1)); // May -> Apr 1
    expect(startOfQuarter(new Date(2026, 11, 31))).toEqual(new Date(2026, 9, 1)); // Dec -> Oct 1
  });
  it("startOfNextQuarter rolls into the next year", () => {
    expect(startOfNextQuarter(new Date(2026, 4, 10))).toEqual(new Date(2026, 6, 1)); // -> Jul 1
    expect(startOfNextQuarter(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1)); // -> Jan 1 2027
  });
  it("startOfYear / startOfNextYear", () => {
    expect(startOfYear(new Date(2026, 5, 15))).toEqual(new Date(2026, 0, 1));
    expect(startOfNextYear(new Date(2026, 5, 15))).toEqual(new Date(2027, 0, 1));
  });
});
