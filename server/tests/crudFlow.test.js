import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens } from "./helpers.js";

const app = createApp();
const auth = () => ({ Authorization: `Bearer ${tokens.officer()}` });
beforeEach(async () => { await resetCrudTables(); });

describe("End-to-end CRUD flow", () => {
  it("creates owner → unit → tenant → lease via the API", async () => {
    const owner = await request(app).post("/api/owners").set(auth())
      .send({ name: "Ortigas Land" });
    expect(owner.status).toBe(201);

    const unit = await request(app).post("/api/units").set(auth())
      .send({ ownerId: owner.body.id, unitNumber: "PH-1", type: "THREE_BR", baseRent: 80000 });
    expect(unit.status).toBe(201);

    const tenant = await request(app).post("/api/tenants").set(auth())
      .send({ name: "Maria Santos", email: "maria@example.com" });
    expect(tenant.status).toBe(201);

    const lease = await request(app).post("/api/leases").set(auth())
      .send({ unitId: unit.body.id, tenantId: tenant.body.id, startDate: "2026-02-01", endDate: "2027-01-31", monthlyRent: 80000, deposit: 160000 });
    expect(lease.status).toBe(201);

    const leases = await request(app).get(`/api/leases?tenantId=${tenant.body.id}`).set(auth());
    expect(leases.status).toBe(200);
    expect(leases.body).toHaveLength(1);
    expect(Number(leases.body[0].monthlyRent)).toBe(80000);
  });
});
