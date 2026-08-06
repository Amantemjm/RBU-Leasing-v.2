import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("Tenants CRUD", () => {
  it("officer creates; viewer lists", async () => {
    const created = await request(app).post("/api/tenants")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "Juan Dela Cruz", email: "juan@example.com" });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/tenants")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("viewer cannot create (403)", async () => {
    const res = await request(app).post("/api/tenants")
      .set("Authorization", `Bearer ${tokens.viewer()}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid input (400)", async () => {
    const res = await request(app).post("/api/tenants")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ email: "bad" });
    expect(res.status).toBe(400);
  });

  it("404 for a missing tenant", async () => {
    const res = await request(app).get("/api/tenants/nope")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(404);
  });

  it("blocks delete when tenant has leases (409)", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id);
    const tenant = await factory.tenant();
    await factory.lease(unit.id, tenant.id);
    const res = await request(app).delete(`/api/tenants/${tenant.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(409);
  });
});
