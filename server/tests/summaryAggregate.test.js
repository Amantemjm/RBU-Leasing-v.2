import { describe, it, expect, beforeEach } from "vitest";
import { resetCrudTables, factory } from "./helpers.js";
import { getExecutiveSummary } from "../src/services/summaryService.js";

beforeEach(async () => { await resetCrudTables(); });

describe("getExecutiveSummary", () => {
  it("labels the period and returns current, prior, and deltas", async () => {
    const summary = await getExecutiveSummary({ type: "month", anchor: new Date(2026, 5, 15) });
    expect(summary.period.type).toBe("month");
    expect(summary.period.label).toBe("June 2026");
    expect(summary).toHaveProperty("current");
    expect(summary).toHaveProperty("prior");
    expect(summary.deltas.collected).toHaveProperty("direction");
  });

  it("marks a metric that rose vs the prior period as 'up' with null pct when prior is zero", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();
    const lease = await factory.lease(u.id, t.id);
    // collected in June (current), nothing in May (prior)
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date(2026, 5, 5), paidDate: new Date(2026, 5, 6) });

    const summary = await getExecutiveSummary({ type: "month", anchor: new Date(2026, 5, 15) });
    expect(summary.current.collected).toBe(25000);
    expect(summary.prior.collected).toBe(0);
    expect(summary.deltas.collected.direction).toBe("up");
    expect(summary.deltas.collected.change).toBe(25000);
    expect(summary.deltas.collected.pct).toBeNull();
  });

  it("labels quarter and year periods", async () => {
    const q = await getExecutiveSummary({ type: "quarter", anchor: new Date(2026, 4, 10) });
    expect(q.period.label).toBe("Q2 2026");
    const y = await getExecutiveSummary({ type: "year", anchor: new Date(2026, 4, 10) });
    expect(y.period.label).toBe("2026");
  });
});
