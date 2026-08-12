import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("role-scoped access", () => {
  it("a tenant sees only their own leases", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t1 = await factory.tenant({ name: "T1" });
    const t2 = await factory.tenant({ name: "T2" });
    await factory.lease(u.id, t1.id);
    await factory.lease(u.id, t2.id);
    const res = await request(app).get("/api/leases").set("Authorization", `Bearer ${tokens.tenant(t1.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tenantId).toBe(t1.id);
  });

  it("a tenant requesting another tenant's lease gets 404", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id);
    const t1 = await factory.tenant({ name: "T1" });
    const t2 = await factory.tenant({ name: "T2" });
    const l2 = await factory.lease(u.id, t2.id);
    const res = await request(app).get(`/api/leases/${l2.id}`).set("Authorization", `Bearer ${tokens.tenant(t1.id)}`);
    expect(res.status).toBe(404);
  });

  it("an owner requesting a lease outside their portfolio gets 404", async () => {
    const o1 = await factory.owner();
    const o2 = await factory.owner({ name: "O2" });
    const u2 = await factory.unit(o2.id, { unitNumber: "202" });
    const t = await factory.tenant();
    const l2 = await factory.lease(u2.id, t.id);
    const res = await request(app).get(`/api/leases/${l2.id}`).set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(404);
  });

  it("a tenant cannot list owners, tenants, or units (403)", async () => {
    const t = await factory.tenant();
    for (const path of ["/api/owners", "/api/tenants", "/api/units"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
      expect(res.status).toBe(403);
    }
  });

  it("an owner cannot list owners or tenants (403) but can list units", async () => {
    const o = await factory.owner();
    await factory.unit(o.id);
    for (const path of ["/api/owners", "/api/tenants"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${tokens.owner(o.id)}`);
      expect(res.status).toBe(403);
    }
    const units = await request(app).get("/api/units").set("Authorization", `Bearer ${tokens.owner(o.id)}`);
    expect(units.status).toBe(200);
  });

  it("GET /api/owners/me returns the caller's own owner record", async () => {
    const o = await factory.owner({ name: "Ayala" });
    const res = await request(app).get("/api/owners/me").set("Authorization", `Bearer ${tokens.owner(o.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: o.id, name: "Ayala" });
  });

  it("GET /api/owners/me is 404 when the account is unlinked", async () => {
    const res = await request(app).get("/api/owners/me").set("Authorization", `Bearer ${tokens.owner()}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/tenants/me returns the caller's own tenant record", async () => {
    const t = await factory.tenant({ name: "Juan" });
    const res = await request(app).get("/api/tenants/me").set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, name: "Juan" });
  });

  it("GET /api/tenants/me is 404 when the account is unlinked", async () => {
    const res = await request(app).get("/api/tenants/me").set("Authorization", `Bearer ${tokens.tenant()}`);
    expect(res.status).toBe(404);
  });

  it("self endpoints enforce role: owners/me needs UNIT_OWNER, tenants/me needs TENANT", async () => {
    const a = await request(app).get("/api/owners/me").set("Authorization", `Bearer ${tokens.admin()}`);
    expect(a.status).toBe(403);
    const b = await request(app).get("/api/tenants/me").set("Authorization", `Bearer ${tokens.officer()}`);
    expect(b.status).toBe(403);
  });
});
