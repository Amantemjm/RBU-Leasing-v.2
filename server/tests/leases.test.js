import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Leases CRUD", () => {
  it("officer creates a lease for an existing unit and tenant", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({
        unitId: unit.id, tenantId: tenant.id,
        startDate: "2026-01-01", endDate: "2026-12-31",
        monthlyRent: 30000, deposit: 60000,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.monthlyRent)).toBe(30000);
  });

  it("rejects a lease with a non-existent unit (400)", async () => {
    const tenant = await factory.tenant();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ unitId: "ghost", tenantId: tenant.id, startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 1000 });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (400)", async () => {
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ monthlyRent: 1000 });
    expect(res.status).toBe(400);
  });

  it("filters leases by tenantId", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const t1 = await factory.tenant({ name: "T1" });
    const t2 = await factory.tenant({ name: "T2" });
    await factory.lease(unit.id, t1.id);
    await factory.lease(unit.id, t2.id);
    const res = await request(app).get(`/api/leases?tenantId=${t1.id}`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tenantId).toBe(t1.id);
  });

  it("viewer cannot create (403)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    const res = await request(app).post("/api/leases")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ unitId: unit.id, tenantId: tenant.id, startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: 1000 });
    expect(res.status).toBe(403);
  });

  it("blocks delete when lease has payments (409)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    const lease = await factory.lease(unit.id, tenant.id);
    await factory.payment(lease.id);
    const res = await request(app).delete(`/api/leases/${lease.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
