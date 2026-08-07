import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("GET /api/dashboard", () => {
  it("returns the metric payload for a viewer", async () => {
    const o = await factory.owner();
    await factory.unit(o.id);
    const res = await request(app).get("/api/dashboard")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body.counts.units).toBe(1);
    expect(res.body.occupancy.totalUnits).toBe(1);
    expect(res.body).toHaveProperty("expiring");
    expect(res.body).toHaveProperty("overdue");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });
});
