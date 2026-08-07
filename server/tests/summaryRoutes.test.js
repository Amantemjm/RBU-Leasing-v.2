import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/summary", () => {
  it("returns the summary for a viewer, anchored by the date param", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t = await factory.tenant();
    const lease = await factory.lease(u.id, t.id);
    await factory.payment(lease.id, { amount: 25000, dueDate: new Date(2026, 5, 5), paidDate: new Date(2026, 5, 6) });

    const res = await request(app).get("/api/summary?period=month&date=2026-06-15")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body.period.type).toBe("month");
    expect(res.body.current.collected).toBe(25000);
    expect(res.body).toHaveProperty("prior");
    expect(res.body.deltas.collected.direction).toBe("up");
  });

  it("rejects an invalid period with 400", async () => {
    const res = await request(app).get("/api/summary?period=decade")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/summary");
    expect(res.status).toBe(401);
  });
});
